import fs from 'fs';

let content = fs.readFileSync('src/components/admin/AdminDocuments.tsx', 'utf-8');

// 1. Add new state variables right after the existing ones
const stateInjection = `  const [activeFolder, setActiveFolder] = useState<string>('all');
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [customFolders, setCustomFolders] = useState<{id: string; clientId: string; name: string}[]>([
    { id: 'f1', clientId: 'CL108', name: 'Documentos societários' },
    { id: 'f2', clientId: 'CL108', name: 'Contratos' },
    { id: 'f3', clientId: 'CL108', name: 'Notas fiscais' },
    { id: 'f4', clientId: 'CL109', name: 'Impostos & Taxas' },
  ]);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderForm, setFolderForm] = useState({ id: '', name: '' });
  
  const clients = [
    { id: 'CL108', name: 'Empresa Alfa Ltda' },
    { id: 'CL109', name: 'Tech Solutions SA' }
  ];`;
content = content.replace(/  const \[activeFolder, setActiveFolder\] = useState<string>\('all'\);/, stateInjection);

// 2. Remove hardcoded folders array and replace with dynamic one
const oldFoldersDef = `  const folders = [
    { id: 'all', name: 'Todos os Documentos', count: documents.length },
    { id: 'Contratos', name: 'Contratos', count: documents.filter((d) => d.folder === 'Contratos').length },
    { id: 'Notas fiscais', name: 'Notas fiscais', count: documents.filter((d) => d.folder === 'Notas fiscais').length },
    { id: 'Documentos societrios', name: 'Documentos societrios', count: documents.filter((d) => d.folder === 'Documentos societrios').length },
    { id: 'Impostos & Taxas', name: 'Impostos & Taxas', count: documents.filter((d) => d.folder === 'Impostos & Taxas').length }
  ];`;
  
const newFoldersDef = `  const displayedFolders = selectedClient === 'all'
    ? [{ id: 'all', name: 'Todos os Documentos', count: documents.length }]
    : [
        { id: 'all', name: 'Todos do Cliente', count: documents.filter(d => d.clientCode === selectedClient).length },
        ...customFolders.filter(f => f.clientId === selectedClient).map(f => ({
          id: f.id,
          name: f.name,
          count: documents.filter(d => d.clientCode === selectedClient && d.folder === f.name).length,
          custom: true
        }))
      ];`;
content = content.replace(/  const folders = \[\s*\{[\s\S]*?\];/m, newFoldersDef);

// Fix regex pattern if there are encoding issues (Societários)
content = content.replace(/const folders = \[[\s\S]*?\];/, newFoldersDef);

// Update filteredDocs to also filter by client
content = content.replace(/const filteredDocs = documents.filter\(\(d\) => \{/, 
`const filteredDocs = documents.filter((d) => {
    if (selectedClient !== 'all' && d.clientCode !== selectedClient) return false;
    
    // Convert folder ID back to name for filtering
    const targetFolderName = activeFolder === 'all' ? 'all' : (customFolders.find(f => f.id === activeFolder)?.name || activeFolder);
`);
content = content.replace(/const matchesFolder = activeFolder === 'all' \|\| d.folder === activeFolder;/, `const matchesFolder = activeFolder === 'all' || targetFolderName === 'all' || d.folder === targetFolderName;`);

// 3. Update the left sidebar (Pastas & Estrutura)
const oldSidebar = `<div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em' }}>
              Pastas & Estrutura
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {folders.map((f) => {`;
const newSidebar = `<div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Visualizar Cliente</label>
              <select 
                className="form-select" 
                value={selectedClient} 
                onChange={e => {
                  setSelectedClient(e.target.value);
                  setActiveFolder('all');
                }}
                style={{ fontSize: 13, padding: '6px 10px' }}
              >
                <option value="all">Visão Global (Todos)</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Pastas
              </div>
              {selectedClient !== 'all' && (
                <button 
                  onClick={() => { setFolderForm({id:'', name:''}); setIsFolderModalOpen(true); }}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}
                >
                  <Plus size={14} /> Nova
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {displayedFolders.map((f) => {`;
content = content.replace(oldSidebar, newSidebar);

// 4. Update the folder buttons to include edit/delete icons
const oldFolderMap = `              {folders.map((f) => {
                const isActive = activeFolder === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setActiveFolder(f.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: isActive ? '#eff6ff' : 'transparent',
                      color: isActive ? '#1d4ed8' : '#334155',
                      fontWeight: isActive ? 600 : 500,
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 150ms ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Folder size={16} color={isActive ? '#3b82f6' : '#94a3b8'} />
                      <span style={{ fontSize: 14 }}>{f.name}</span>
                    </div>
                    {f.count > 0 && (
                      <span
                        style={{
                          background: isActive ? '#dbeafe' : '#f1f5f9',
                          color: isActive ? '#1e40af' : '#64748b',
                          fontSize: 12,
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontWeight: 600
                        }}
                      >
                        {f.count}
                      </span>
                    )}
                  </button>
                );
              })}`;
              
const newFolderMap = `              {displayedFolders.map((f: any) => {
                const isActive = activeFolder === f.id;
                return (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => setActiveFolder(f.id)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: isActive ? '#eff6ff' : 'transparent',
                        color: isActive ? '#1d4ed8' : '#334155',
                        fontWeight: isActive ? 600 : 500,
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 150ms ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Folder size={16} color={isActive ? '#3b82f6' : '#94a3b8'} />
                        <span style={{ fontSize: 14 }}>{f.name}</span>
                      </div>
                      {f.count > 0 && (
                        <span
                          style={{
                            background: isActive ? '#dbeafe' : '#f1f5f9',
                            color: isActive ? '#1e40af' : '#64748b',
                            fontSize: 12,
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontWeight: 600
                          }}
                        >
                          {f.count}
                        </span>
                      )}
                    </button>
                    {f.custom && (
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button 
                          onClick={() => { setFolderForm({id: f.id, name: f.name}); setIsFolderModalOpen(true); }}
                          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
                          title="Editar Pasta"
                        >
                          <Edit size={14} />
                        </button>
                        <button 
                          onClick={() => {
                            if(window.confirm('Excluir pasta?')) {
                              setCustomFolders(customFolders.filter(x => x.id !== f.id));
                              if (activeFolder === f.id) setActiveFolder('all');
                            }
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 4 }}
                          title="Excluir Pasta"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}`;
content = content.replace(oldFolderMap, newFolderMap);

// Also need to import Edit and Trash
content = content.replace(/Upload\n} from 'lucide-react';/, `Upload,\n  Edit,\n  Trash\n} from 'lucide-react';`);

// 5. Append Folder Modal at the end
const folderModalJSX = `
      {/* Modal: Gerenciar Pasta */}
      <Modal
        open={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        title={folderForm.id ? "Editar Pasta" : "Nova Pasta"}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Nome da Pasta</label>
            <input 
              type="text" 
              className="form-input" 
              value={folderForm.name} 
              onChange={e => setFolderForm({...folderForm, name: e.target.value})}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setIsFolderModalOpen(false)}>Cancelar</Button>
            <Button variant="success" onClick={() => {
              if (!folderForm.name.trim()) return;
              if (folderForm.id) {
                setCustomFolders(customFolders.map(f => f.id === folderForm.id ? { ...f, name: folderForm.name } : f));
              } else {
                setCustomFolders([...customFolders, { id: 'f' + Date.now(), clientId: selectedClient, name: folderForm.name }]);
              }
              setIsFolderModalOpen(false);
            }}>Salvar Pasta</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}`;
content = content.replace(/    <\/div>\s*<(\/)?div>\s*\);\s*}\s*export default AdminDocuments;/g, '</div></div></Modal>' + folderModalJSX + '\nexport default AdminDocuments;');
content = content.replace(/    <\/div>\n  \);\n}\n\nexport default AdminDocuments;/g, folderModalJSX + '\n\nexport default AdminDocuments;');

fs.writeFileSync('src/components/admin/AdminDocuments.tsx', content);
console.log('AdminDocuments.tsx updated successfully.');
