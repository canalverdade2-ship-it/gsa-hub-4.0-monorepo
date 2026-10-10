import React, { useState, useEffect } from 'react';
import { X, Upload, AlertCircle, CheckCircle2, User, Building2, Calendar, Flag, FileText, Link } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import { logService } from '../../../lib/logService';
import { notificationService } from '../../../lib/notificationService';
import { uploadFile, removeFile } from '../../../lib/storage';
import { useRealtimeSubscription } from '../../../hooks/useRealtime';
import { callAdminRpc, createAdminRequestId } from '../../../lib/adminRpc';

interface Props {
  colaboradorId?: string;
  colaboradorNome?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const PRIORIDADES = [
  { id: 'urgente', label: 'Urgente', color: 'bg-red-500 text-white', ring: 'ring-red-500' },
  { id: 'alta',    label: 'Alta',    color: 'bg-orange-500 text-white', ring: 'ring-orange-500' },
  { id: 'normal',  label: 'Normal',  color: 'bg-blue-500 text-white', ring: 'ring-blue-500' },
  { id: 'baixa',   label: 'Baixa',   color: 'bg-neutral-400 text-white', ring: 'ring-neutral-400' },
];

export function NovaDemandaModal({ colaboradorId, colaboradorNome, onClose, onSuccess }: Props) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form fields
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [detalhes, setDetalhes] = useState('');
  const [prioridade, setPrioridade] = useState('normal');
  const [prazoLimite, setPrazoLimite] = useState('');
  const [tipoDestino, setTipoDestino] = useState<'colaborador' | 'prestador' | 'pool'>('colaborador');
  const [destinoId, setDestinoId] = useState('');
  const [valorProposto, setValorProposto] = useState('');
  const [linkEntrega, setLinkEntrega] = useState('');
  const [arquivos, setArquivos] = useState<File[]>([]);

  // Data lists
  const [oss, setOss] = useState<any[]>([]);
  const [selectedOs, setSelectedOs] = useState('');
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [prestadores, setPrestadores] = useState<any[]>([]);

  const fetchData = async () => {
    try {
      const [os, colab, prest] = await Promise.all([
        supabase.from('ordens_servico').select('id, codigo_os, cliente:clientes(nome), orcamentos:orcamento_id(anexos)').eq('status', 'andamento').order('data_inicio', { ascending: false }),
        supabase.from('colaboradores').select('id, nome').eq('status', 'ativo'),
        supabase.from('prestadores').select('id, nome_razao').eq('status', 'ativo'),
      ]);
      setOss(os.data || []);
      setColaboradores(colab.data || []);
      setPrestadores(prest.data || []);
    } catch (error) {
      console.error('Erro ao buscar dados iniciais:', error);
      toast.error('Erro ao buscar dados iniciais.');
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  useRealtimeSubscription([
    { table: 'ordens_servico', onChange: fetchData, debounceMs: 300 },
    { table: 'colaboradores', onChange: fetchData, debounceMs: 300 },
    { table: 'prestadores', onChange: fetchData, debounceMs: 300 },
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !descricao.trim() || !prazoLimite) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    if (tipoDestino !== 'pool' && !destinoId) {
      toast.error('Selecione o responsável.');
      return;
    }
    setIsSubmitting(true);
    const uploadedPaths: string[] = [];
    try {
      const arquivosUrls: any[] = [];
      if (arquivos.length > 0) {
        const uploadPromises = arquivos.map(async (file) => {
          const ext = file.name.split('.').pop();
          const path = `briefings/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          try {
            const uploaded = await uploadFile(file, 'entregas_demandas', path);
            uploadedPaths.push(uploaded.path);
            return uploaded.path;
          } catch (uploadErr) {
            console.error('Erro ao enviar anexo do briefing:', uploadErr);
            return null;
          }
        });
        const uploadedUrls = await Promise.all(uploadPromises);
        arquivosUrls.push(...uploadedUrls.filter(url => url !== null));
      }
      
      // Buscar anexos do orçamento se houver OS selecionada
      if (selectedOs) {
        const osRef = oss.find(o => o.id === selectedOs);
        if (osRef?.orcamentos?.anexos && Array.isArray(osRef.orcamentos.anexos)) {
          // Preservar a estrutura original (string ou objeto {nome, url})
          arquivosUrls.push(...osRef.orcamentos.anexos);
        }
      }

      const payload: any = {
        titulo,
        descricao,
        detalhes,
        prioridade,
        prazo_limite: new Date(prazoLimite).toISOString(),
        arquivos_briefing: arquivosUrls,
        link_entrega: linkEntrega || null,
        os_id: selectedOs || null,
        colaborador_id: tipoDestino === 'colaborador' ? destinoId : null,
        prestador_id: tipoDestino === 'prestador' ? destinoId : null,
        valor_proposto_admin: valorProposto ? Number(valorProposto) : null,
      };

      let nova = null;
      try {
        nova = await callAdminRpc<any>('gsa_admin_create_provider_demand', {
          p_payload: payload,
          p_request_id: createAdminRequestId(),
        });
      } catch (error) {
        console.error('Erro ao criar demanda:', error);
        if (uploadedPaths.length) await removeFile(uploadedPaths);
        toast.error('Erro ao criar demanda.');
        setIsSubmitting(false);
        return;
      }

      // Notificações
      if (tipoDestino === 'colaborador' && destinoId) {
        // Notifica o colaborador específico
        await notificationService.notifyColaborador(
          destinoId,
          `📋 Nova Demanda Atribuída`,
          `Uma nova demanda "${titulo}" foi atribuída a você. Prioridade: ${prioridade.toUpperCase()}.`,
          'demandas', 'demanda_atribuida',
          { itemId: nova.id, prioridade: prioridade === 'urgente' ? 'urgente' : 'alta' }
        );
      } else if (tipoDestino === 'prestador' && destinoId) {
        // Notifica o Prestador Externo
        await notificationService.notifyProvider(
          destinoId,
          `📋 Nova Demanda Atribuída`,
          `Você recebeu uma nova demanda "${titulo}". Prioridade: ${prioridade.toUpperCase()}.`,
          'demandas', 'demanda_atribuida',
          { itemId: nova.id, prioridade: prioridade === 'urgente' ? 'urgente' : 'alta' }
        );
        // Também notifica o Admin Geral que uma demanda foi criada para prestador
        await notificationService.notifyAdmin(
          `📋 Nova Demanda (Prestador)`,
          `Uma nova demanda "${titulo}" foi criada para um prestador externo.`,
          'demandas', 'sistema',
          { itemId: nova.id }
        );
      } else {
        // Notificação Geral para o Painel Adm (Pool Central)
        await notificationService.notifyAdmin(
          `📋 Nova Demanda em Aberto`,
          `Uma nova demanda "${titulo}" foi criada no Pool Central e aguarda atribuição. Prioridade: ${prioridade.toUpperCase()}.`,
          'demandas', 'sistema',
          { itemId: nova.id, prioridade: prioridade === 'urgente' ? 'urgente' : 'alta' }
        );
      }

      // Log Action
      await logService.logAction({
        acao: 'CRIAR_DEMANDA_INTERNA',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `Criou uma nova demanda interna: ${titulo} (Prioridade: ${prioridade})`
      });

      toast.success('Demanda criada com sucesso!');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao criar demanda: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const prioAtual = PRIORIDADES.find(p => p.id === prioridade)!;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-neutral-900/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[96vw] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl max-h-[95vh] overflow-hidden rounded-[2.5rem] bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-neutral-100 shrink-0">
          <div>
            <h2 className="text-2xl font-black text-neutral-900 uppercase tracking-tight">Nova Demanda Interna</h2>
            <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest mt-1">Etapa {step} de 2</p>
          </div>
          <button onClick={onClose} disabled={isSubmitting} className="h-10 w-10 rounded-2xl bg-neutral-100 flex items-center justify-center text-neutral-400 hover:bg-neutral-200 transition-all disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-8 pt-4 shrink-0">
          <div className="flex gap-2">
            {[1, 2].map(s => (
              <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s <= step ? 'bg-indigo-500' : 'bg-neutral-200'}`} />
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-8 space-y-6">
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                {/* Título */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">Título da Demanda *</label>
                  <input
                    type="text"
                    value={titulo}
                    onChange={e => setTitulo(e.target.value)}
                    placeholder="Ex: Elaborar relatório fiscal Q1..."
                    className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                </div>

                {/* Descrição */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">Descrição / Briefing *</label>
                  <textarea
                    value={descricao}
                    onChange={e => setDescricao(e.target.value)}
                    placeholder="Descreva o que precisa ser feito, quais os entregáveis esperados..."
                    rows={4}
                    className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                    required
                  />
                </div>

                {/* Detalhes adicionais */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">Instruções Detalhadas</label>
                  <textarea
                    value={detalhes}
                    onChange={e => setDetalhes(e.target.value)}
                    placeholder="Passo a passo, referências, contexto adicional..."
                    rows={3}
                    className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  />
                </div>

                {/* OS vinculada */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">OS Vinculada (Opcional)</label>
                  <select
                    value={selectedOs}
                    onChange={e => setSelectedOs(e.target.value)}
                    className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">Sem OS vinculada</option>
                    {oss.map(os => (
                      <option key={os.id} value={os.id}>{os.codigo_os} — {os.cliente?.nome || 'Cliente'}</option>
                    ))}
                  </select>
                </div>

                {/* Prioridade */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-neutral-500 mb-3">Prioridade *</label>
                  <div className="grid grid-cols-4 gap-3">
                    {PRIORIDADES.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPrioridade(p.id)}
                        className={`py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ring-2 ${prioridade === p.id ? `${p.color} ${p.ring} scale-105 shadow-lg` : 'bg-neutral-100 text-neutral-500 ring-transparent hover:ring-neutral-300'}`}
                      >
                        {p.id === 'urgente' && '🔴 '}{p.id === 'alta' && '🟠 '}{p.id === 'normal' && '🔵 '}{p.id === 'baixa' && '⚪ '}
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Prazo */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">Prazo Limite *</label>
                  <input
                    type="datetime-local"
                    value={prazoLimite}
                    onChange={e => setPrazoLimite(e.target.value)}
                    className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                {/* Tipo de destino */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-neutral-500 mb-3">Atribuir Para *</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'colaborador', label: 'Equipe Interna', icon: User, color: 'text-indigo-600 bg-indigo-50' },
                      { id: 'prestador',   label: 'Prestador Externo', icon: Building2, color: 'text-orange-600 bg-orange-50' },
                      { id: 'pool',        label: 'Pool Central', icon: AlertCircle, color: 'text-emerald-600 bg-emerald-50' },
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => { setTipoDestino(t.id as any); setDestinoId(''); }}
                        className={`flex flex-col items-center gap-3 rounded-2xl p-5 border-2 transition-all ${tipoDestino === t.id ? 'border-indigo-500 bg-indigo-50' : 'border-neutral-100 bg-white hover:border-neutral-200'}`}
                      >
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${tipoDestino === t.id ? t.color : 'bg-neutral-100 text-neutral-400'}`}>
                          <t.icon className="h-5 w-5" />
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${tipoDestino === t.id ? 'text-indigo-700' : 'text-neutral-400'}`}>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Seleção do responsável */}
                {tipoDestino === 'colaborador' && (
                  <div className="animate-in fade-in">
                    <label className="block text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">Selecionar Colaborador *</label>
                    <select
                      value={destinoId}
                      onChange={e => setDestinoId(e.target.value)}
                      className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                      required
                    >
                      <option value="">Selecione...</option>
                      {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                )}

                {tipoDestino === 'prestador' && (
                  <div className="animate-in fade-in space-y-4">
                    <div>
                      <label className="block text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">Selecionar Prestador *</label>
                      <select
                        value={destinoId}
                        onChange={e => setDestinoId(e.target.value)}
                        className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                        required
                      >
                        <option value="">Selecione...</option>
                        {prestadores.map(p => <option key={p.id} value={p.id}>{p.nome_razao}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">Valor Proposto (R$)</label>
                      <input 
                        type="number"
                        step="0.01"
                        value={valorProposto}
                        inputMode="numeric"
onChange={(e) => setValorProposto(e.target.value)}
                        placeholder="0,00"
                        className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                )}

                {tipoDestino === 'pool' && (
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-700 font-medium animate-in fade-in">
                    ✅ A demanda ficará no pool central e poderá ser atribuída depois.
                  </div>
                )}

                {/* Link de referência */}
                <div>
                  <label className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neutral-500 mb-2"><Link className="h-3 w-3"/>Link de Referência</label>
                  <input
                    type="url"
                    value={linkEntrega}
                    onChange={e => setLinkEntrega(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                {/* Arquivos de briefing */}
                <div>
                  <label className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neutral-500 mb-2"><FileText className="h-3 w-3"/>Arquivos de Briefing (Máx 5)</label>
                  
                  {arquivos.length > 0 && (
                    <div className="mb-4 space-y-2">
                      {arquivos.map((f, i) => (
                        <div key={i} className="flex items-center gap-3 bg-indigo-50 rounded-2xl px-4 py-3 border border-indigo-100 animate-in fade-in slide-in-from-top-2">
                          <CheckCircle2 className="h-4 w-4 text-indigo-500 shrink-0" />
                          <span className="text-xs font-bold text-indigo-700 truncate flex-1">{f.name}</span>
                          <button 
                            type="button" 
                            onClick={() => setArquivos(prev => prev.filter((_, idx) => idx !== i))}
                            className="h-6 w-6 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-500 hover:bg-indigo-200 transition-all"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {arquivos.length < 5 && (
                    <label className={`flex flex-col items-center justify-center h-32 cursor-pointer rounded-2xl border-2 border-dashed transition-all bg-neutral-50 border-neutral-200 hover:border-indigo-300 hover:bg-neutral-100`}>
                      <input 
                        type="file" 
                        multiple 
                        className="hidden" 
                        onChange={e => {
                          const files = Array.from(e.target.files || []);
                          setArquivos(prev => [...prev, ...files].slice(0, 5));
                        }} 
                      />
                      <div className="text-center">
                        <Upload className="h-8 w-8 text-neutral-300 mx-auto mb-1" />
                        <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Clique para anexar arquivos</p>
                        <p className="text-[10px] text-neutral-400 mt-1">{arquivos.length}/5 arquivos selecionados</p>
                      </div>
                    </label>
                  )}
                </div>

                {/* Resumo da prioridade */}
                <div className={`rounded-2xl p-4 flex items-center gap-3 ${prioridade === 'urgente' ? 'bg-red-50' : prioridade === 'alta' ? 'bg-orange-50' : prioridade === 'normal' ? 'bg-blue-50' : 'bg-neutral-100'}`}>
                  <Flag className={`h-5 w-5 ${prioridade === 'urgente' ? 'text-red-500' : prioridade === 'alta' ? 'text-orange-500' : prioridade === 'normal' ? 'text-blue-500' : 'text-neutral-400'}`} />
                  <div>
                    <p className="text-xs font-black text-neutral-700 uppercase tracking-widest">Prioridade: {prioridade.toUpperCase()}</p>
                    {prazoLimite && <p className="text-xs text-neutral-500 mt-0.5">Prazo: {new Date(prazoLimite).toLocaleString('pt-BR')}</p>}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-8 border-t border-neutral-100 flex justify-between shrink-0">
            {step > 1 ? (
              <button type="button" onClick={() => setStep(s => s - 1)} disabled={isSubmitting} className="px-6 py-3 rounded-2xl bg-neutral-100 text-neutral-600 font-bold text-sm hover:bg-neutral-200 transition-all disabled:opacity-50">
                ← Voltar
              </button>
            ) : <div />}

            {step < 2 ? (
              <button
                type="button"
                onClick={() => {
                  if (!titulo.trim() || !descricao.trim() || !prazoLimite) { toast.error('Preencha todos os campos obrigatórios.'); return; }
                  setStep(2);
                }}
                className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-indigo-600 text-white font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
              >
                Próximo →
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-[#1a1a1a] text-white font-black text-sm uppercase tracking-widest hover:bg-black transition-all shadow-xl disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isSubmitting ? 'Criando...' : 'Criar Demanda'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
