import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X, Upload, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { uploadFile, removeFile, getPrivateFileUrl } from '../../../lib/storage';
import { callAdminRpc, createAdminRequestId } from '../../../lib/adminRpc';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { notificationService } from '../../../lib/notificationService';
import { useRealtimeSubscription } from '../../../hooks/useRealtime';

interface Props {
  demandaId: string;
  autorId: string;
  autorNome: string;
  autorTipo: 'admin' | 'colaborador' | 'prestador';
  disabled?: boolean;
}

export function DemandasComentarios({ demandaId, autorId, autorNome, autorTipo, disabled }: Props) {
  const [comentarios, setComentarios] = useState<any[]>([]);
  const [mensagem, setMensagem] = useState('');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchComentarios = async () => {
    const { data } = await supabase
      .from('demanda_comentarios')
      .select('*')
      .eq('demanda_id', demandaId)
      .order('created_at', { ascending: true });
    setComentarios(data || []);
  };

  useEffect(() => {
    void fetchComentarios();
  }, [demandaId]);

  useRealtimeSubscription({
    table: 'demanda_comentarios',
    filter: `demanda_id=eq.${demandaId}`,
    onChange: fetchComentarios,
    debounceMs: 100,
  }, [demandaId]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    if (!mensagem.trim() && arquivos.length === 0) return;
    setEnviando(true);
    const uploadedPaths: string[] = [];
    try {
      const urls: string[] = [];
      if (arquivos.length > 0) {
        const uploadPromises = arquivos.map(async (file) => {
          const ext = file.name.split('.').pop();
          const path = `comentarios/${demandaId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const __up = await uploadFile(file, 'entregas_demandas', path);
          uploadedPaths.push(__up.path);
          return __up.path;
        });
        const uploadedUrls = await Promise.all(uploadPromises);
        urls.push(...uploadedUrls);
      }

      await callAdminRpc('gsa_admin_add_demand_comment', {
        p_demanda_id: demandaId,
        p_mensagem: mensagem.trim() || '—',
        p_arquivos_urls: urls,
        p_request_id: createAdminRequestId(),
      });

      // Notificar a outra parte
      const { data: demandaData } = await supabase
        .from('prestador_demandas')
        .select('prestador_id, colaborador_id, titulo')
        .eq('id', demandaId)
        .single();

      if (demandaData) {
        const tituloAbrev = demandaData.titulo || '#' + demandaId.slice(0, 6);
        
        if (autorTipo === 'prestador') {
          await notificationService.notifyAdmin(
            '💬 Nova Mensagem',
            `${autorNome} (Prestador) enviou uma mensagem na demanda "${tituloAbrev}".`,
            'demandas', 'novo_comentario',
            { itemId: demandaId, prioridade: 'normal' }
          );
        } else {
          if (demandaData.prestador_id) {
            await notificationService.notifyProvider(
              demandaData.prestador_id,
              '💬 Nova Mensagem da Administração',
              `${autorNome} enviou uma mensagem na demanda "${tituloAbrev}".`,
              'demandas', 'novo_comentario',
              { itemId: demandaId, prioridade: 'normal' }
            );
          }
        }
      }

      setMensagem('');
      setArquivos([]);
    } catch (err) {
      await removeFile(uploadedPaths);
      toast.error('Erro ao enviar comentário.');
    } finally {
      setEnviando(false);
    }
  };

  const TIPO_COLORS: Record<string, string> = {
    admin: 'bg-indigo-600',
    colaborador: 'bg-blue-500',
    prestador: 'bg-orange-500',
  };

  const TIPO_LABELS: Record<string, string> = {
    admin: 'ADM',
    colaborador: 'Colaborador',
    prestador: 'Prestador',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Título */}
      <div className="px-6 py-4 border-b border-neutral-100 shrink-0">
        <h4 className="text-xs font-black uppercase tracking-widest text-neutral-500">💬 Comentários da Demanda</h4>
        <p className="text-[10px] text-neutral-400 mt-0.5">Chat em tempo real entre equipe interna e prestador — não aparece para o cliente</p>
      </div>

      {/* Lista de comentários */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {comentarios.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <div className="h-12 w-12 rounded-2xl bg-neutral-100 flex items-center justify-center mb-2">
              <span className="text-2xl">💬</span>
            </div>
            <p className="text-xs text-neutral-400 font-medium">Nenhum comentário ainda.</p>
            <p className="text-[10px] text-neutral-300">Seja o primeiro a comentar!</p>
          </div>
        )}

        {comentarios.map((c) => {
          const isMeu = c.autor_id === autorId;
          return (
            <div key={c.id} className={`flex gap-3 ${isMeu ? 'flex-row-reverse' : ''}`}>
              {/* Avatar */}
              <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 text-white text-[10px] font-black ${TIPO_COLORS[c.autor_tipo] || 'bg-neutral-500'}`}>
                {c.autor_nome.charAt(0).toUpperCase()}
              </div>
              <div className={`max-w-[75%] space-y-1 ${isMeu ? 'items-end' : 'items-start'} flex flex-col`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black text-neutral-600">{isMeu ? 'Você' : c.autor_nome}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                    c.autor_tipo === 'admin' ? 'bg-indigo-100 text-indigo-700' :
                    c.autor_tipo === 'colaborador' ? 'bg-blue-100 text-blue-700' :
                    'bg-orange-100 text-orange-700'
                  }`}>{TIPO_LABELS[c.autor_tipo]}</span>
                  <span className="text-[9px] text-neutral-300 flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {format(new Date(c.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>
                <div className={`rounded-2xl px-4 py-3 text-sm font-medium leading-relaxed ${isMeu ? 'bg-indigo-600 text-white rounded-tr-md' : 'bg-neutral-100 text-neutral-800 rounded-tl-md'}`}>
                  {c.mensagem !== '—' && <p className="whitespace-pre-wrap">{c.mensagem}</p>}
                  {c.arquivos_urls && Array.isArray(c.arquivos_urls) && c.arquivos_urls.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {c.arquivos_urls.map((url: string, i: number) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-wider rounded-xl px-3 py-2 transition-all ${isMeu ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white text-indigo-600 hover:bg-indigo-50'}`}
                        >
                          <Upload className="h-3 w-3" /> Anexo {i + 1}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input de novo comentário */}
      {!disabled ? (
        <div className="p-4 border-t border-neutral-100 shrink-0">
        {arquivos.length > 0 && (
          <div className="mb-2 space-y-1">
            {arquivos.map((f, i) => (
              <div key={i} className="flex items-center gap-2 bg-emerald-50 rounded-xl px-3 py-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                <span className="text-[10px] font-medium text-emerald-700 truncate flex-1">{f.name}</span>
                <button type="button" onClick={() => setArquivos(prev => prev.filter((_, idx) => idx !== i))} className="text-emerald-500 hover:text-emerald-700">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={enviar} className="flex items-end gap-2">
          <div className="flex-1 bg-neutral-100 rounded-2xl flex items-end gap-2 px-4 py-3">
            <textarea
              value={mensagem}
              onChange={e => setMensagem(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(e as any); } }}
              placeholder="Escreva um comentário interno..."
              rows={1}
              className="flex-1 bg-transparent text-sm font-medium text-neutral-800 placeholder-neutral-400 outline-none resize-none max-h-28"
            />
          </div>
          <label className="h-10 w-10 rounded-xl bg-neutral-100 flex items-center justify-center cursor-pointer text-neutral-500 hover:bg-neutral-200 transition-all shrink-0">
            <input 
              type="file" 
              multiple 
              className="hidden" 
              onChange={e => {
                const files = Array.from(e.target.files || []);
                setArquivos(prev => [...prev, ...files].slice(0, 5));
              }} 
            />
            <Paperclip className="h-4 w-4" />
          </label>
          <button
            type="submit"
            disabled={enviando || (!mensagem.trim() && arquivos.length === 0)}
            className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white hover:bg-indigo-700 transition-all disabled:opacity-40 shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
      ) : (
        <div className="p-6 border-t border-neutral-100 bg-neutral-50 shrink-0">
          <p className="text-center text-xs font-bold text-neutral-400 italic">
            Esta demanda está concluída. O chat está disponível apenas para visualização do histórico.
          </p>
        </div>
      )}
    </div>
  );
}
