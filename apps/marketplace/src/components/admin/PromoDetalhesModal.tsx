import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { supabase } from '../../lib/supabase';
import { Promocao } from '../../types';
import { formatDate, formatDateTime, copyToClipboard } from '../../lib/utils';
import { User, Calendar, Trash2, Copy, Check, Activity, Clock, AlertCircle, CalendarDays, Gift, Tag, Info, CheckCircle, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';

type ClienteAtivacao = {
  id: string;
  cliente: {
    nome: string;
    codigo_cliente: string;
  };
  data_ativacao: string;
  data_expiracao: string;
  status: string;
  data_uso?: string;
  orcamento_id?: string;
  promocao_id?: string;
};

export function PromoDetalhesModal({ 
  isOpen, 
  onClose, 
  promo,
  onDelete,
  onSuspender
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  promo: Promocao | null;
  onDelete: (id: string) => void;
  onSuspender: (id: string, status: 'ativa' | 'suspensa') => void;
  colaboradorNome?: string | null;
}) {
  const [ativacoes, setAtivacoes] = useState<ClienteAtivacao[]>([]);
  const [orcamentosVinculados, setOrcamentosVinculados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && promo) {
      fetchAtivacoes();
    }
  }, [isOpen, promo]);

  const fetchAtivacoes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('cliente_promocoes')
      .select('id, data_ativacao, data_expiracao, status, data_uso, orcamento_id, promocao_id, cliente:clientes(nome, codigo_cliente)')
      .eq('promocao_id', promo?.id)
      .order('data_ativacao', { ascending: false });

    if (error) {
      console.error('Error fetching ativacoes:', error);
    } else {
      setAtivacoes(data as any || []);
    }

    // Buscar orçamentos vinculados a esta promoção
    const { data: orcData } = await supabase
      .from('orcamentos')
      .select('id, codigo_orcamento, total, desconto, promocao_id, data_criacao, status, cliente_id')
      .eq('promocao_id', promo?.id)
      .neq('status', 'cancelado');

    setOrcamentosVinculados(orcData || []);
    setLoading(false);
  };

  if (!promo) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gestão da Promoção" size="5xl">
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Banner Hero Style */}
        <div className={`relative overflow-hidden rounded-[2rem] p-8 text-white shadow-xl ${
          promo.status === 'ativa' ? 'bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-700 shadow-emerald-500/20' :
          promo.status === 'cancelada' ? 'bg-gradient-to-br from-rose-500 via-red-500 to-rose-700 shadow-rose-500/20' :
          promo.status === 'suspensa' ? 'bg-gradient-to-br from-amber-500 via-orange-500 to-amber-700 shadow-amber-500/20' :
          'bg-gradient-to-br from-indigo-500 via-purple-500 to-violet-700 shadow-indigo-500/20'
        }`}>
          {/* Background Decorative Icon */}
          <div className="absolute -top-10 -right-10 opacity-10 rotate-12 pointer-events-none scale-150">
            <Gift className="h-64 w-64" />
          </div>

          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="inline-flex w-max items-center gap-2 rounded-xl bg-white/20 px-3 py-1.5 backdrop-blur-md ring-1 ring-white/30 shadow-inner">
                 <Tag className="h-4 w-4" />
                 <span className="text-[10px] font-black uppercase tracking-widest">{promo.tipo}</span>
              </div>
              
              <button 
                onClick={async () => {
                  const success = await copyToClipboard(promo.codigo_promocao);
                  if (success) toast.success('Código copiado!');
                }}
                className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl backdrop-blur-md ring-1 ring-white/30 transition-colors active:scale-95"
              >
                <Copy className="h-3 w-3" />
                <span className="text-[10px] font-black uppercase tracking-widest">CÓD: {promo.codigo_promocao}</span>
              </button>
            </div>
            
            <h3 className="text-2xl sm:text-3xl font-black tracking-tighter leading-tight text-white drop-shadow-md">
              {promo.titulo}
            </h3>
          </div>
        </div>

        {/* Info Grids */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          <div className="col-span-1 md:col-span-2 bg-white p-6 rounded-[2rem] border border-neutral-100 shadow-sm relative overflow-hidden group">
            <h4 className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3 relative z-10">
               <Info className="h-3.5 w-3.5 text-indigo-400" /> Sobre a Promoção
            </h4>
            <p className="text-sm text-neutral-600 leading-relaxed font-medium relative z-10">
               {promo.descricao}
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-[2rem] border border-neutral-100 shadow-sm flex flex-col justify-center">
            <h4 className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3">
               <CalendarDays className="h-3.5 w-3.5 text-indigo-400" /> Configuração de Prazo
            </h4>
            <div className="space-y-4 pt-1">
              <div className="flex justify-between items-center border-b border-neutral-100 pb-2">
                <p className="text-[10px] font-bold text-neutral-400 uppercase">Validade após uso</p>
                <p className="text-sm font-black text-neutral-800">{promo.prazo_validade_meses} meses</p>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-bold text-neutral-400 uppercase">Período Divulgação</p>
                <div className="text-right">
                  <p className="text-xs font-black text-neutral-800">{formatDate(promo.data_inicio_divulgacao)}</p>
                  <p className="text-[10px] text-neutral-400 font-bold uppercase">ATÉ {formatDate(promo.data_fim_divulgacao)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-neutral-100 shadow-sm flex flex-col justify-center items-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
               <Activity className="h-24 w-24" />
            </div>
            <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2 text-center w-full">Total de Ativações</h4>
            <div className="text-5xl font-black text-indigo-600 drop-shadow-sm mb-2">
               {ativacoes.length}
            </div>
            <div className="text-[10px] font-bold text-neutral-400 bg-neutral-100 px-3 py-1 rounded-full uppercase tracking-widest">
               Clientes resgataram
            </div>
          </div>
          
        </div>

        {/* Relatório de Ativações */}
        <div className="bg-white rounded-[2rem] border border-neutral-100 shadow-sm overflow-hidden">
           <div className="px-6 py-4 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
             <h4 className="text-xs font-black text-neutral-900 uppercase tracking-widest flex items-center gap-2">
               <User className="h-4 w-4 text-indigo-500" /> Extrato de Resgates
             </h4>
           </div>
           <div className="p-4 bg-neutral-50/20 max-h-[500px] overflow-y-auto">
             {loading ? (
               <div className="py-8 text-center text-sm font-black text-neutral-400 uppercase tracking-widest animate-pulse">Carregando dados...</div>
             ) : ativacoes.length === 0 ? (
               <div className="py-8 text-center text-sm font-bold text-neutral-400">Nenhum cliente resgatou esta promoção ainda.</div>
             ) : (
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                 {ativacoes.map((ativ) => {
                   const orcVinculado = orcamentosVinculados.find(o => o.cliente_id === (ativ.cliente as any)?.id) 
                     || orcamentosVinculados.find(o => o.id === ativ.orcamento_id);
                   const isUsada = ativ.status === 'usada' || !!orcVinculado;

                   return (
                     <div key={ativ.id} className={`p-4 bg-white rounded-2xl border shadow-sm transition-all group ${
                       isUsada ? 'border-sky-200 hover:border-sky-300 hover:shadow-sky-100' : 'border-neutral-100 hover:shadow-md hover:border-indigo-100'
                     }`}>
                       {/* Header: Cliente + Status */}
                       <div className="flex items-center justify-between mb-3">
                         <div className="flex items-center gap-3">
                           <div className={`h-10 w-10 rounded-[12px] flex items-center justify-center transition-colors ${
                             isUsada ? 'bg-sky-50 group-hover:bg-sky-600' : 'bg-indigo-50 group-hover:bg-indigo-600'
                           }`}>
                             <User className={`h-5 w-5 transition-colors ${
                               isUsada ? 'text-sky-600 group-hover:text-white' : 'text-indigo-600 group-hover:text-white'
                             }`} />
                           </div>
                           <div>
                             <p className="text-sm font-black text-neutral-900">{ativ.cliente.nome}</p>
                             <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-0.5">CÓD: {ativ.cliente.codigo_cliente}</p>
                           </div>
                         </div>
                         <div className="text-right">
                           {isUsada ? (
                             <p className="text-[10px] font-bold text-sky-600 bg-sky-50 px-2.5 py-1 rounded-md uppercase tracking-widest inline-flex items-center gap-1 ring-1 ring-sky-200">
                               <CheckCircle className="h-3 w-3" /> Utilizada
                             </p>
                           ) : (
                             <p className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md uppercase tracking-widest inline-block mb-1">
                               Ativado
                             </p>
                           )}
                         </div>
                       </div>

                       {/* Informações de Prazo da Ativação */}
                       <div className="flex items-center gap-6 bg-neutral-50 p-3 rounded-xl border border-neutral-100/60 mb-2">
                         <div>
                           <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Data de Ativação</p>
                           <p className="text-xs font-black text-neutral-700 mt-0.5 flex items-center gap-1"><Calendar className="h-3 w-3 text-neutral-400" /> {formatDate(ativ.data_ativacao)}</p>
                         </div>
                         <div>
                           <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Válida Até</p>
                           <p className="text-xs font-black text-neutral-700 mt-0.5 flex items-center gap-1"><Clock className="h-3 w-3 text-neutral-400" /> {formatDate(ativ.data_expiracao)}</p>
                         </div>
                       </div>

                       {/* Painel de utilização — só aparece quando usada */}
                       {isUsada && orcVinculado && (
                         <div className="mt-2 rounded-xl bg-sky-50 p-4 ring-1 ring-sky-200/60 space-y-3">
                           <div className="flex items-center gap-2 text-[10px] font-black text-sky-600 uppercase tracking-widest">
                             <FileText className="h-3.5 w-3.5" /> Dados da Utilização
                           </div>
                           <div className="rounded-xl bg-white p-3 ring-1 ring-sky-100 shadow-sm space-y-2.5">
                             <div className="flex justify-between items-center">
                               <p className="text-[10px] font-bold text-sky-500 uppercase">Orçamento Vinculado</p>
                               <p className="text-base font-black text-sky-950 font-mono">{orcVinculado.codigo_orcamento}</p>
                             </div>
                             <div className="grid grid-cols-2 gap-3 pt-2 border-t border-sky-100">
                               <div>
                                 <p className="text-[10px] font-bold text-sky-500 uppercase">Data de Utilização</p>
                                 <p className="text-sm font-black text-sky-950">{formatDate(orcVinculado.data_criacao)}</p>
                               </div>
                               <div>
                                 <p className="text-[10px] font-bold text-sky-500 uppercase">Horário</p>
                                 <p className="text-sm font-black text-sky-950">{formatDateTime(orcVinculado.data_criacao)}</p>
                               </div>
                             </div>
                             <div className="grid grid-cols-2 gap-3 pt-2 border-t border-sky-100">
                               <div>
                                 <p className="text-[10px] font-bold text-sky-500 uppercase">Valor do Orçamento</p>
                                 <p className="text-sm font-black text-sky-950">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(orcVinculado.total)}</p>
                               </div>
                               {orcVinculado.desconto > 0 && (
                                 <div>
                                   <p className="text-[10px] font-bold text-sky-500 uppercase">Desconto Aplicado</p>
                                   <p className="text-sm font-black text-emerald-600">-{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(orcVinculado.desconto)}</p>
                                 </div>
                               )}
                             </div>
                             <div className="pt-2 border-t border-sky-100">
                               <p className="text-[10px] font-bold text-sky-500 uppercase mb-1">Status do Orçamento</p>
                               <span className={`inline-flex py-1 px-3 text-[10px] font-black uppercase tracking-widest rounded-lg ring-1 ${
                                 orcVinculado.status === 'aprovado' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                                 orcVinculado.status === 'aberto' ? 'bg-amber-50 text-amber-700 ring-amber-200' :
                                 orcVinculado.status === 'em revisão' ? 'bg-indigo-50 text-indigo-700 ring-indigo-200' :
                                 'bg-neutral-50 text-neutral-600 ring-neutral-200'
                               }`}>
                                 {orcVinculado.status === 'aberto' ? 'Aberto' : orcVinculado.status === 'aprovado' ? 'Aprovado' : orcVinculado.status === 'em revisão' ? 'Em Revisão' : orcVinculado.status}
                               </span>
                             </div>
                           </div>
                         </div>
                       )}
                     </div>
                   );
                 })}
               </div>
             )}
            </div>
         </div>

        {/* Ações / Footer */}
        <div className="pt-4 flex flex-col sm:flex-row justify-end gap-3 border-t border-neutral-100">
           <button 
             onClick={() => {
               onSuspender(promo.id, promo.status === 'ativa' ? 'suspensa' : 'ativa');
               onClose();
             }}
             className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3.5 text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-sm ${
               promo.status === 'ativa' ? 'bg-amber-50 text-amber-600 hover:bg-amber-100 ring-1 ring-amber-200/50 hover:shadow-amber-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 ring-1 ring-emerald-200/50 hover:shadow-emerald-100'
             }`}
           >
             {promo.status === 'ativa' ? <><Clock className="w-4 h-4"/> Suspender Oferta</> : <><Check className="w-4 h-4"/> Reativar Oferta</>}
           </button>
           
           <button 
             onClick={() => {
               onDelete(promo.id);
               onClose();
             }}
             className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3.5 text-xs font-black uppercase tracking-widest rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-200/50 hover:bg-rose-100 hover:shadow-rose-100 shadow-sm transition-all"
           >
             <Trash2 className="h-4 w-4" />
             Excluir
           </button>

           <button 
             onClick={onClose}
             className="flex-1 sm:flex-none px-8 py-3.5 rounded-2xl bg-neutral-900 text-white text-xs font-black uppercase tracking-widest shadow-xl hover:bg-black transition-all active:scale-95 flex items-center justify-center"
           >
             Sair / Voltar
           </button>
        </div>

      </div>
    </Modal>
  );
}
