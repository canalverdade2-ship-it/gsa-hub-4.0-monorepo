import os, re

base_admin = r'C:\Users\Adriano Farias\Downloads\GSA_HUB 2.0\GSA HUB 3.0\src\components\admin'
base_client = r'C:\Users\Adriano Farias\Downloads\GSA_HUB 2.0\GSA HUB 3.0\src\components\client'

# 2. AdminCatalogs.tsx
file_path = os.path.join(base_admin, 'AdminCatalogs.tsx')
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

new_modals = """
      {/* Modal: Novo Serviço */}
      <Modal open={isServiceModalOpen} onClose={() => setIsServiceModalOpen(false)} title="Cadastrar Novo Serviço (SRV)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Código</label>
              <input type="text" className="form-input" readOnly value={`SRV${100 + services.length + 1}`} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Preço Base (R$)</label>
              <input type="text" className="form-input" value={newServicePrice} onChange={(e) => setNewServicePrice(e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Nome do Serviço</label>
            <input type="text" className="form-input" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Descrição</label>
            <textarea className="form-input" value={newServiceDesc} onChange={(e) => setNewServiceDesc(e.target.value)} />
          </div>
          <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <Button variant="secondary" style={{ width: '100%' }} onClick={() => setIsServiceModalOpen(false)}>Cancelar</Button>
            </div>
            <div style={{ flex: 2 }}>
              <Button variant="primary" style={{ width: '100%' }} onClick={handleCreateService}>Salvar</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal: Editar Serviço */}
      {editingService && (
        <Modal open={true} onClose={() => setEditingService(null)} title={`Editar Serviço: ${editingService.code}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Código</label>
                <input type="text" className="form-input" readOnly value={editingService.code} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Preço Base (R$)</label>
                <input type="text" className="form-input" value={newServicePrice} onChange={(e) => setNewServicePrice(e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nome do Serviço</label>
              <input type="text" className="form-input" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Descrição</label>
              <textarea className="form-input" value={newServiceDesc} onChange={(e) => setNewServiceDesc(e.target.value)} />
            </div>
            <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'flex', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <Button variant="secondary" style={{ width: '100%' }} onClick={() => setEditingService(null)}>Cancelar</Button>
              </div>
              <div style={{ flex: 2 }}>
                <Button variant="primary" style={{ width: '100%' }} onClick={handleUpdateService}>Salvar</Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Novo RPS */}
      <Modal open={isRpsModalOpen} onClose={() => setIsRpsModalOpen(false)} title="Cadastrar Responsável (RPS)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Nome Completo</label>
            <input type="text" className="form-input" value={newRpsName} onChange={(e) => setNewRpsName(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">E-mail</label>
              <input type="email" className="form-input" value={newRpsEmail} onChange={(e) => setNewRpsEmail(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Telefone</label>
              <input type="text" className="form-input" placeholder="(00) 00000-0000" />
            </div>
          </div>
          <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <Button variant="secondary" style={{ width: '100%' }} onClick={() => setIsRpsModalOpen(false)}>Cancelar</Button>
            </div>
            <div style={{ flex: 2 }}>
              <Button variant="primary" style={{ width: '100%' }} onClick={handleCreateRps}>Salvar</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal: Editar RPS */}
      {editingRps && (
        <Modal open={true} onClose={() => setEditingRps(null)} title={`Editar RPS: ${editingRps.code}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nome Completo</label>
              <input type="text" className="form-input" value={newRpsName} onChange={(e) => setNewRpsName(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">E-mail</label>
                <input type="email" className="form-input" value={newRpsEmail} onChange={(e) => setNewRpsEmail(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Telefone</label>
                <input type="text" className="form-input" placeholder="(00) 00000-0000" />
              </div>
            </div>
            <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'flex', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <Button variant="secondary" style={{ width: '100%' }} onClick={() => setEditingRps(null)}>Cancelar</Button>
              </div>
              <div style={{ flex: 2 }}>
                <Button variant="primary" style={{ width: '100%' }} onClick={handleUpdateRps}>Salvar</Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
"""

pattern = r'\{\/\* Modal: Novo Serviço \*\/}.*?(?=\s*<\/div>\s*\);\s*\}\s*export default)'
content = re.sub(pattern, new_modals, content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

# 3. ClientContracts.tsx
file_path = os.path.join(base_client, 'ClientContracts.tsx')
if os.path.exists(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    new_modals = """
      {/* Modal: Sucesso ao assinar */}
      <Modal open={successModal} onClose={() => setSuccessModal(false)} title="">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14, padding: '20px 0' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', marginBottom: 10 }}>
            <CheckCircle2 size={32} />
          </div>
          <h3 style={{ margin: 0, fontSize: 20, color: '#0f172a' }}>Contrato Enviado!</h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>O contrato foi assinado e enviado com sucesso para a nossa equipe.</p>
          <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'flex', gap: 14, width: '100%' }}>
            <Button variant="primary" style={{ width: '100%' }} onClick={() => setSuccessModal(false)}>Entendi</Button>
          </div>
        </div>
      </Modal>
"""
    pattern = r'<Modal open=\{successModal}.*?(?=\s*<\/div>\s*\);\s*\}\s*export default)'
    content = re.sub(pattern, new_modals, content, flags=re.DOTALL)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)


# 4. ClientDocuments.tsx
file_path = os.path.join(base_client, 'ClientDocuments.tsx')
if os.path.exists(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    new_modals = """
      {/* Modal: Solicitar Correção */}
      <Modal open={!!requestCorrection} onClose={() => setRequestCorrection(null)} title="Solicitar Correção de Documento">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize:13, color:'#64748b', margin:'0 0 10px 0' }}>Explique o que precisa ser corrigido no documento.</p>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Motivo da Correção</label>
            <textarea className="form-input" placeholder="Detalhe o erro ou problema encontrado..."></textarea>
          </div>
          <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <Button variant="secondary" style={{ width: '100%' }} onClick={() => setRequestCorrection(null)}>Cancelar</Button>
            </div>
            <div style={{ flex: 2 }}>
              <Button variant="primary" style={{ width: '100%' }} onClick={() => setRequestCorrection(null)}>Enviar Solicitação</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal: Enviar Arquivo */}
      <Modal open={!!uploadDoc} onClose={() => setUploadDoc(null)} title="Enviar Documento">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize:13, color:'#64748b', margin:'0 0 10px 0' }}>Selecione o arquivo do seu computador ou celular.</p>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Arquivo</label>
            <input type="file" className="form-input" style={{ padding: '8px' }} />
          </div>
          <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <Button variant="secondary" style={{ width: '100%' }} onClick={() => setUploadDoc(null)}>Cancelar</Button>
            </div>
            <div style={{ flex: 2 }}>
              <Button variant="primary" style={{ width: '100%' }} onClick={() => setUploadDoc(null)}>Confirmar Envio</Button>
            </div>
          </div>
        </div>
      </Modal>
"""
    pattern = r'\{\/\* Modal: Solicitar Correção \*\/}.*?(?=\s*<\/div>\s*\);\s*\}\s*export default)'
    content = re.sub(pattern, new_modals, content, flags=re.DOTALL)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)


# 5. ClientFinance.tsx
file_path = os.path.join(base_client, 'ClientFinance.tsx')
if os.path.exists(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    new_modals = """
      {/* Modal: Pagamento / Pix */}
      {selectedInvoice && (
        <Modal open={true} onClose={() => setSelectedInvoice(null)} title="Pagamento via Pix">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ textAlign: 'center', margin: '10px 0' }}>
              <div style={{ fontSize: 14, color: '#64748b' }}>Valor da Parcela</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#10b981' }}>R$ {(selectedInvoice.amount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Banco</label>
              <input type="text" className="form-input" readOnly value="Banco GSA S.A." />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Chave Pix (CNPJ)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" className="form-input" readOnly value="12.345.678/0001-90" />
                <Button variant="secondary">Copiar</Button>
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Data de Pagamento *</label>
              <input type="date" className="form-input" />
            </div>
            <p style={{ fontSize:13, color:'#64748b', margin:'0' }}>Após realizar o pagamento, confirme abaixo para análise financeira.</p>
            <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'flex', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <Button variant="secondary" style={{ width: '100%' }} onClick={() => setSelectedInvoice(null)}>Cancelar</Button>
              </div>
              <div style={{ flex: 2 }}>
                <Button variant="primary" style={{ width: '100%', background: '#10b981', borderColor: '#10b981', color: '#fff' }} onClick={() => setSelectedInvoice(null)}>Confirmar Pagamento</Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
"""
    pattern = r'\{\/\* Modal: Pagamento / Pix \*\/}.*?(?=\s*<\/div>\s*\);\s*\}\s*export default)'
    content = re.sub(pattern, new_modals, content, flags=re.DOTALL)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

# 6. ClientOrders.tsx
file_path = os.path.join(base_client, 'ClientOrders.tsx')
if os.path.exists(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    new_modals = """
      {/* Modal: Detalhes da Ordem de Serviço */}
      {selectedOS && (
        <Modal open={true} onClose={() => setSelectedOS(null)} title={`Detalhes da OS: ${selectedOS.code}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Serviço Contratado</label>
              <input type="text" className="form-input" readOnly value={selectedOS.service} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Data de Início</label>
                <input type="text" className="form-input" readOnly value={selectedOS.startDate} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Previsão</label>
                <input type="text" className="form-input" readOnly value={selectedOS.expectedEnd || '-'} />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Responsável (RPS)</label>
              <input type="text" className="form-input" readOnly value={selectedOS.rps} />
            </div>
            <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'flex', gap: 14 }}>
              <Button variant="secondary" style={{ width: '100%' }} onClick={() => setSelectedOS(null)}>Fechar Detalhes</Button>
            </div>
          </div>
        </Modal>
      )}
"""
    pattern = r'\{\/\* Modal: Detalhes da Ordem de Serviço \*\/}.*?(?=\s*<\/div>\s*\);\s*\}\s*export default)'
    content = re.sub(pattern, new_modals, content, flags=re.DOTALL)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)


# 7. ClientTickets.tsx
file_path = os.path.join(base_client, 'ClientTickets.tsx')
if os.path.exists(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    new_modals = """
      {/* Modal: Novo Chamado */}
      <Modal open={isNewTicketModalOpen} onClose={() => setIsNewTicketModalOpen(false)} title="Abrir Novo Chamado">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize:13, color:'#64748b', margin:'0 0 10px 0' }}>Descreva sua dúvida ou solicitação para a nossa equipe.</p>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Título do chamado *</label>
            <input type="text" className="form-input" placeholder="Ex: Dúvida sobre imposto" value={newTicketTitle} onChange={(e) => setNewTicketTitle(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">OS Vinculada (Opcional)</label>
            <select className="form-select" value={newTicketOS} onChange={(e) => setNewTicketOS(e.target.value)}>
              <option value="">Selecione uma OS (Opcional)</option>
              <option value="OS105">OS105</option>
              <option value="OS108">OS108</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Mensagem Inicial *</label>
            <textarea className="form-input" rows={4} placeholder="Detalhe sua solicitação..." value={newTicketDesc} onChange={(e) => setNewTicketDesc(e.target.value)}></textarea>
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

