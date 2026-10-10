import React, { useState } from 'react';
import { CheckSquare, Plus, Clock, UserCheck, AlertCircle, MoreVertical, X } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { api, isDemoMode } from '../../api';

interface TaskItem {
  id: string;
  title: string;
  orderCode: string;
  clientName: string;
  assignee: string;
  priority: 'Alta' | 'Normal' | 'Urgente';
  status: 'todo' | 'in_progress' | 'done';
  deadline: string;
  observations?: string;
}

export function AdminTasks() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // New task form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskOrder, setTaskOrder] = useState(isDemoMode ? 'OS105' : '');
  const [taskClient, setTaskClient] = useState(isDemoMode ? 'Empresa Alfa Ltda' : '');
  const [taskAssignee, setTaskAssignee] = useState(isDemoMode ? 'João Carlos da Silva' : '');
  const [taskPriority, setTaskPriority] = useState<'Alta' | 'Normal' | 'Urgente'>('Alta');
  const [taskDeadline, setTaskDeadline] = useState(isDemoMode ? '06/10/2026' : '');
  const [orderOptions, setOrderOptions] = useState<any[]>([]);
  const [rpsOptions, setRpsOptions] = useState<any[]>([]);
  const [clientOptions, setClientOptions] = useState<any[]>([]);

  const [tasks, setTasks] = useState<TaskItem[]>(isDemoMode ? [
    {
      id: 't-1',
      title: 'Verificar se todos os documentos dos sócios estão legíveis',
      orderCode: 'OS105',
      clientName: 'Empresa Alfa Ltda',
      assignee: 'João Carlos da Silva',
      priority: 'Alta',
      status: 'in_progress',
      deadline: 'Hoje'
    },
    {
      id: 't-2',
      title: 'Protocolar solicitação na Junta Comercial de SP',
      orderCode: 'OS105',
      clientName: 'Empresa Alfa Ltda',
      assignee: 'João Carlos da Silva',
      priority: 'Urgente',
      status: 'todo',
      deadline: '05/10/2026'
    },
    {
      id: 't-3',
      title: 'Emitir comprovante de protocolo e anexar à OS',
      orderCode: 'OS105',
      clientName: 'Empresa Alfa Ltda',
      assignee: 'Ana Martins',
      priority: 'Normal',
      status: 'todo',
      deadline: '08/10/2026'
    },
    {
      id: 't-4',
      title: 'Conferência inicial da documentação cadastral',
      orderCode: 'OS105',
      clientName: 'Empresa Alfa Ltda',
      assignee: 'Mariana Souza',
      priority: 'Normal',
      status: 'done',
      deadline: '02/10/2026'
    }
  ] : []);

  const reloadTasks = async () => {
    try {
      const state = await api('/state');
      const clients = Array.isArray(state.clients) ? state.clients : [];
      const clientById = new Map<string, any>(clients.map((client: any) => [String(client.id), client] as [string, any]));
      const orders = Array.isArray(state.orders) ? state.orders : [];
      const rps = Array.isArray(state.rps) ? state.rps : [];
      setClientOptions(clients);
      setOrderOptions(orders);
      setRpsOptions(rps);
      setTaskOrder((current) => current && orders.some((order: any) => String(order.code || `OS${order.id}`) === String(current))
        ? current
        : String(orders[0]?.code || (orders[0]?.id ? `OS${orders[0].id}` : '')));
      setTaskAssignee((current) => current && rps.some((item: any) => String(item.name) === String(current))
        ? current
        : String(rps[0]?.name || ''));
      const remoteTasks = Array.isArray(state.tasks) ? state.tasks : [];
      setTasks(remoteTasks.map((task: any) => {
        const order = orders.find((item: any) => String(item.id) === String(task.orderId) || String(item.code) === String(task.orderCode));
        const client = clientById.get(String(task.clientId)) || (order?.clientId ? clientById.get(String(order.clientId)) : null);
        return {
          ...task,
          id: String(task.id),
          title: task.title || 'Tarefa operacional',
          orderCode: task.orderCode || order?.code || (task.orderId ? `OS${task.orderId}` : '—'),
          clientName: task.clientName || client?.name || order?.clientName || '—',
          assignee: task.assignee || '—',
          priority: task.priority || 'Normal',
          status: task.status || 'todo',
          deadline: task.deadline || '—'
        };
      }));
    } catch {
      // Keep the last confirmed board visible while the API reconnects.
    }
  };

  React.useEffect(() => {
    if (!isDemoMode) void reloadTasks();
    const handleReload = () => { if (!isDemoMode) void reloadTasks(); };
    window.addEventListener('gsa:reload', handleReload);
    return () => window.removeEventListener('gsa:reload', handleReload);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCreateTask = async () => {
    if (!taskTitle.trim()) return;

    const order = orderOptions.find((item: any) => String(item.code || `OS${item.id}`) === String(taskOrder));
    const client = clientOptions.find((item: any) => String(item.id) === String(order?.clientId));

    const newTask: TaskItem = {
      id: `t-${Date.now()}`,
      title: taskTitle,
      orderCode: taskOrder,
      clientName: client?.name || order?.clientName || taskClient,
      assignee: taskAssignee,
      priority: taskPriority,
      status: 'todo',
      deadline: taskDeadline
      , observations: ''
    };

    try {
      const saved = await api('/tasks', {
        title: newTask.title,
        orderId: order?.id || null,
        orderCode: newTask.orderCode,
        clientId: order?.clientId || client?.id || null,
        clientName: newTask.clientName,
        assignee: newTask.assignee,
        priority: newTask.priority,
        status: newTask.status,
        deadline: newTask.deadline
      });
      newTask.id = String(saved.id);
      await reloadTasks();
    } catch {
      setTasks((current) => [newTask, ...current]);
    }
    setTaskTitle('');
    setIsModalOpen(false);
    showToast(`Tarefa criada e adicionada à coluna 'A Fazer'!`);
  };

  const columns = [
    { id: 'todo', label: 'A Fazer', color: '#64748b' },
    { id: 'in_progress', label: 'Em Andamento', color: '#2563eb' },
    { id: 'done', label: 'Concluído', color: '#10b981' }
  ];
  const moveTask = (status: TaskItem['status']) => {
    if (!draggedTaskId) return;
    setTasks((items) => items.map((task) => task.id === draggedTaskId ? { ...task, status } : task));
    if (!isDemoMode) void api(`/tasks/${draggedTaskId}`, { status }, 'PATCH').catch(() => undefined);
    setDraggedTaskId(null);
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
      <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Tarefas da Operação</h1>
          <p className="page-subtitle">Quadro de atividades e pendências operacionais das Ordens de Serviço.</p>
        </div>
        <Button
          variant="primary"
          size="md"
          icon={<Plus size={16} />}
          onClick={() => setIsModalOpen(true)}
        >
          Nova Tarefa
        </Button>
      </div>

      {/* Kanban Board */}
      <div style={{ overflowX: 'auto', paddingBottom: 16 }}>
        <div className="kanban-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(290px, 1fr))', gap: 20, alignItems: 'start', minWidth: 880 }}>
        {columns.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          return (
            <div
              key={col.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => moveTask(col.id as TaskItem['status'])}
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: 16
              }}
            >
              <div className="responsive-row"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 14,
                  paddingBottom: 8,
                  borderBottom: `2px solid ${col.color}`
                }}
              >
                <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{col.label}</span>
                  <span
                    style={{
                      background: '#e2e8f0',
                      color: '#475569',
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 12,
                      padding: '2px 8px'
                    }}
                  >
                    {colTasks.length}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => { e.stopPropagation(); setDraggedTaskId(task.id); }}
                    onDragEnd={() => setDraggedTaskId(null)}
                    onClick={() => setSelectedTask(task)}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: 14,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      cursor: draggedTaskId === task.id ? 'grabbing' : 'grab',
                      opacity: draggedTaskId === task.id ? 0.55 : 1,
                      transition: 'opacity 150ms ease, transform 150ms ease'
                    }}
                  >
                    <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span className="pill pill--blue" style={{ fontSize: 11, padding: '2px 8px' }}>
                        {task.orderCode}
                      </span>
                      <span
                        className={`pill pill--${task.priority === 'Urgente' || task.priority === 'Alta' ? 'red' : 'gray'}`}
                        style={{ fontSize: 11, padding: '2px 8px' }}
                      >
                        {task.priority}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.4 }}>
                      {task.title}
                    </div>

                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Cliente: <strong>{task.clientName}</strong>
                    </div>

                    <div className="responsive-row"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingTop: 8,
                        borderTop: '1px solid #f1f5f9',
                        fontSize: 12,
                        color: '#64748b'
                      }}
                    >
                      <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <UserCheck size={14} color="#2563eb" />
                        <span>{task.assignee}</span>
                      </div>
                      <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={13} />
                        <span>{task.deadline}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* Modal: Nova Tarefa */}
      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title="Cadastrar Nova Tarefa Operacional">
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px 0' }}>Preencha os dados da tarefa e atribua um responsável.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Descrição da Tarefa *</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ex: Conferir certidões negativas do sócio majoritário"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Ordem de Serviço (OS)</label>
              <select
                className="form-select"
                value={taskOrder}
                onChange={(e) => setTaskOrder(e.target.value)}
              >
                {orderOptions.length ? orderOptions.map((order: any) => (
                  <option key={order.id} value={order.code || `OS${order.id}`}>{order.code || `OS${order.id}`} — {order.title || order.serviceName || 'Ordem de Serviço'}</option>
                )) : isDemoMode ? <>
                  <option value="OS105">OS105 — Abertura de empresa</option>
                  <option value="OS108">OS108 — Alteração Contratual</option>
                  <option value="OS109">OS109 — BPO Fiscal & Contábil</option>
                </> : <option value="" disabled>Nenhuma OS disponível</option>}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Prioridade</label>
              <select
                className="form-select"
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as any)}
              >
                <option value="Normal">Normal</option>
                <option value="Alta">Alta</option>
                <option value="Urgente">Urgente</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Responsável (RPS)</label>
              <select
                className="form-select"
                value={taskAssignee}
                onChange={(e) => setTaskAssignee(e.target.value)}
              >
                {rpsOptions.length ? rpsOptions.map((rps: any) => (
                  <option key={rps.id} value={rps.name}>{rps.name}</option>
                )) : isDemoMode ? <>
                  <option value="João Carlos da Silva">João Carlos da Silva</option>
                  <option value="Ana Martins">Ana Martins</option>
                  <option value="Mariana Souza">Mariana Souza</option>
                </> : <option value="" disabled>Nenhum responsável disponível</option>}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Prazo de Conclusão</label>
              <input
                type="text"
                className="form-input"
                value={taskDeadline}
                onChange={(e) => setTaskDeadline(e.target.value)}
              />
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: 20 }}></div>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" style={{ flex: 2 }} onClick={handleCreateTask}>
              Criar Tarefa
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Gerenciar Tarefa */}
      {selectedTask && (
        <Modal open={!!selectedTask} onClose={() => setSelectedTask(null)} title="Gerenciar Tarefa">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>Título da Tarefa</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{selectedTask.title}</div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>OS Vinculada</div>
                <div style={{ fontSize: 14, color: '#0f172a' }}>{selectedTask.orderCode}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Cliente</div>
                <div style={{ fontSize: 14, color: '#0f172a' }}>{selectedTask.clientName}</div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: 12, marginTop: 12 }}></div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Status da Tarefa</label>
              <select 
                className="form-select" 
                value={selectedTask.status} 
                onChange={(e) => {
                  const newStatus = e.target.value as any;
                  setTasks(tasks.map(t => t.id === selectedTask.id ? { ...t, status: newStatus } : t));
                  setSelectedTask({ ...selectedTask, status: newStatus });
                  if (!isDemoMode) void api(`/tasks/${selectedTask.id}`, { status: newStatus }, 'PATCH').catch(() => undefined);
                  showToast('Status atualizado!');
                }}
              >
                <option value="todo">A Fazer</option>
                <option value="in_progress">Em Andamento</option>
                <option value="done">Concluído</option>
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Adicionar observações</label>
              <textarea className="form-textarea" value={selectedTask.observations || ''} placeholder="Registre observações sobre este serviço..." onChange={(e) => { const observations = e.target.value; setTasks(tasks.map(t => t.id === selectedTask.id ? { ...t, observations } : t)); setSelectedTask({ ...selectedTask, observations }); if (!isDemoMode) void api(`/tasks/${selectedTask.id}`, { observations }, 'PATCH').catch(() => undefined); }} />
              <p style={{ color: '#64748b', fontSize: 12, margin: '6px 0 0 0' }}>As observações permanecem registradas até a conclusão da tarefa.</p>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: 20 }}></div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="secondary" style={{ flex: 1 }} onClick={() => setSelectedTask(null)}>
                Voltar
              </Button>
              <div style={{ display: 'flex', gap: 10, flex: 2, justifyContent: 'flex-end' }}>
                <Button 
                  variant="danger" 
                  onClick={() => { setIsDeleteConfirmOpen(true); }}
                >
                  Excluir Tarefa
                </Button>
                <Button variant="primary" onClick={() => setSelectedTask(null)}>
                  Salvar e Fechar
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Confirmar Exclusão de Tarefa */}
      <Modal open={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="Excluir Tarefa">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, background: '#fef2f2', padding: 16, borderRadius: 8, border: '1px solid #fecaca' }}>
          <p style={{ fontSize: 14, color: '#991b1b', margin: 0 }}>
            Tem certeza que deseja excluir esta tarefa permanentemente?
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => setIsDeleteConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" style={{ flex: 2 }} onClick={() => {
              if (selectedTask) {
                setTasks(tasks.filter(t => t.id !== selectedTask.id));
                if (!isDemoMode) void api(`/tasks/${selectedTask.id}`, undefined, 'DELETE').catch(() => undefined);
              }
              setIsDeleteConfirmOpen(false);
              setSelectedTask(null);
              showToast('Tarefa removida com sucesso.');
            }}>
              Excluir
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default AdminTasks;
