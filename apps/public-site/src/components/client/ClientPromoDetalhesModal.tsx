import React from 'react';
import { Modal } from '../ui/Modal';
import { Promocao, ClientePromocao } from '../../types';
import { formatDate, formatDateTime } from '../../lib/utils';
import { Clock, CheckCircle, AlertCircle, Gift, Tag, Info, CalendarDays, Activity } from 'lucide-react';

export function ClientPromoDetalhesModal({ 
  isOpen, 
  onClose, 
  promo,
  ativacao,
  orcamentoEmUso
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  promo: Promocao | null;
  ativacao?: ClientePromocao;
  orcamentoEmUso?: any;
}) {
  if (!promo) return null;

  const getTempoCorrido = () => {
    if (!ativacao) return null;
    const inicio = new Date(ativacao.data_ativacao);
    const agora = new Date();
    const diffMs = agora.getTime() - inicio.getTime();
    const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return `${diffDias} dias decorridos`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalhes da Vantagem" size="full">
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Banner Hero Style */}
        <div className={`relative overflow-hidden rounded-[2rem] p-8 text-white shadow-xl ${
          orcamentoEmUso ? 'bg-gradient-to-br from-sky-500 via-cyan-500 to-sky-700 shadow-sky-500/20' :
          ativacao?.status === 'ativa' ? 'bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-700 shadow-emerald-500/20' :
          ativacao?.status === 'cancelado' ? 'bg-gradient-to-br from-rose-500 via-red-500 to-rose-700 shadow-rose-500/20' :
          promo.status === 'suspensa' ? 'bg-gradient-to-br from-amber-500 via-orange-500 to-amber-700 shadow-amber-500/20' :
          'bg-gradient-to-br from-indigo-500 via-purple-500 to-violet-700 shadow-indigo-500/20'
        }`}>
          {/* Background Decorative Icon */}
          <div className="absolute -top-10 -right-10 opacity-10 rotate-12 pointer-events-none scale-150">
            <Gift className="h-64 w-64" />
          </div>

          <div className="relative z-10 flex flex-col gap-4">
            <div className="inline-flex w-max items-center gap-2 rounded-xl bg-white/20 px-3 py-1.5 backdrop-blur-md ring-1 ring-white/30 shadow-inner">
               <Tag className="h-4 w-4" />
               <span className="text-[10px] font-black uppercase tracking-widest">{promo.tipo}</span>
            </div>
            
            <h3 className="text-2xl sm:text-3xl font-black tracking-tighter leading-tight text-white drop-shadow-md">
              {promo.titulo}
            </h3>
          </div>
        </div>

        {/* Content Grids */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Descrição Card */}
          <div className="col-span-1 md:col-span-2 bg-white p-6 rounded-[2rem] border border-neutral-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
            <div className="absolute inset-0 bg-gradient-to-br from-neutral-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <h4 className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3 relative z-10">
               <Info className="h-3.5 w-3.5 text-indigo-400" /> Detalhes da Promoção
            </h4>
            <p className="text-sm text-neutral-600 leading-relaxed font-medium relative z-10">
               {promo.descricao}
            </p>
          </div>
          
          {/* Regras Gerais */}
          <div className="bg-white p-6 rounded-[2rem] border border-neutral-100 shadow-sm flex flex-col justify-center">
            <h4 className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3">
               <CalendarDays className="h-3.5 w-3.5 text-indigo-400" /> Regras Básicas
            </h4>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold text-neutral-400 uppercase">Validade do Benefício</p>
                <p className="text-sm font-black text-neutral-800">{promo.prazo_validade_meses} meses após ativação</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-neutral-400 uppercase">Período de Resgate</p>
                <p className="text-sm font-black text-neutral-800">Até {formatDate(promo.data_fim_divulgacao)}</p>
              </div>
            </div>
          </div>

          {/* Status Ativação */}
          <div className={`p-6 rounded-[2rem] border shadow-sm flex flex-col justify-center relative overflow-hidden ${
             !ativacao ? 'bg-neutral-50 border-neutral-100' :
             ativacao.status === 'cancelado' ? 'bg-rose-50 border-rose-100' :
             'bg-emerald-50 border-emerald-100'
          }`}>
             {!ativacao ? (
               <div className="flex flex-col items-center justify-center h-full text-center gap-2 opacity-60">
                 <Clock className="w-8 h-8 text-neutral-400" />
                 <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Ainda Não Ativada</p>
               </div>
             ) : ativacao.status === 'cancelado' ? (
               <div className="space-y-4">
                 <div className="flex items-center gap-2 text-rose-600">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm font-black uppercase tracking-widest">Cancelada</span>
                 </div>
                 <div className="space-y-1">
                   <p className="text-[10px] font-bold text-rose-500/70 uppercase">Data de Cancelamento</p>
                   <p className="text-sm font-black text-rose-900">{formatDate(ativacao.data_cancelamento || '')}</p>
                 </div>
                 <div className="space-y-1">
                   <p className="text-[10px] font-bold text-rose-500/70 uppercase">Justificativa</p>
                   <p className="text-sm font-medium text-rose-800 italic leading-snug">{ativacao.motivo_cancelamento}</p>
                 </div>
               </div>
              ) : orcamentoEmUso ? (
                <div className="space-y-5 relative z-10">
                  <div className="absolute -bottom-8 -right-8 opacity-10 pointer-events-none">
                     <CheckCircle className="w-40 h-40 text-sky-600" />
                  </div>
                  <div className="flex items-center gap-2 text-sky-600">
                     <CheckCircle className="h-5 w-5" />
                     <span className="text-sm font-black uppercase tracking-widest">Promoção Utilizada</span>
                  </div>

                  <div className="rounded-2xl bg-white p-4 ring-1 ring-sky-200 shadow-sm space-y-3">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-sky-500 uppercase tracking-widest">Orçamento Vinculado</p>
                      <p className="text-lg font-black text-sky-950 font-mono">{orcamentoEmUso.codigo_orcamento}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold text-sky-500 uppercase">Data de Utilização</p>
                        <p className="text-sm font-black text-sky-950">{formatDate(orcamentoEmUso.data_criacao)}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold text-sky-500 uppercase">Horário</p>
                        <p className="text-sm font-black text-sky-950">{formatDateTime(orcamentoEmUso.data_criacao)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-sky-100">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold text-sky-500 uppercase">Valor do Orçamento</p>
                        <p className="text-sm font-black text-sky-950">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(orcamentoEmUso.total)}</p>
                      </div>
                      {orcamentoEmUso.desconto > 0 && (
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-bold text-sky-500 uppercase">Desconto Aplicado</p>
                          <p className="text-sm font-black text-emerald-600">-{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(orcamentoEmUso.desconto)}</p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-0.5 pt-2 border-t border-sky-100">
                      <p className="text-[10px] font-bold text-sky-500 uppercase">Status do Orçamento</p>
                      <span className="inline-flex py-1 px-3 bg-sky-100 text-sky-700 text-[10px] font-black uppercase tracking-widest rounded-lg ring-1 ring-sky-200">
                        {orcamentoEmUso.status === 'aberto' ? 'Aberto' : orcamentoEmUso.status === 'aprovado' ? 'Aprovado' : orcamentoEmUso.status === 'em revisão' ? 'Em Revisão' : orcamentoEmUso.status}
                      </span>
                    </div>
                  </div>

                  <div className="pt-1">
                    <span className="inline-flex py-1 px-3 bg-sky-200/50 text-sky-800 text-[10px] font-black uppercase tracking-widest rounded-lg ring-1 ring-sky-300">
                      Benefício Concluído
                    </span>
                  </div>
                </div>
              ) : (
               <div className="space-y-4 relative z-10">
                 <div className="absolute -bottom-8 -right-8 opacity-10 pointer-events-none">
                    <CheckCircle className="w-40 h-40 text-emerald-600" />
                 </div>
                 <div className="flex items-center gap-2 text-emerald-600">
                    <Activity className="h-5 w-5 animate-pulse" />
                    <span className="text-sm font-black uppercase tracking-widest">Ativada e Em Uso</span>
                 </div>
                 <div className="space-y-1">
                   <p className="text-[10px] font-bold text-emerald-600/70 uppercase">Data de Início</p>
                   <p className="text-sm font-black text-emerald-950">{formatDate(ativacao.data_ativacao)}</p>
                 </div>
                 <div className="space-y-1">
                   <p className="text-[10px] font-bold text-emerald-600/70 uppercase">Vencimento da Oferta</p>
                   <p className="text-sm font-black text-emerald-950">{formatDate(ativacao.data_expiracao)}</p>
                 </div>
                 <div className="pt-2">
                   <span className="inline-flex py-1 px-3 bg-emerald-200/50 text-emerald-800 text-[10px] font-black uppercase tracking-widest rounded-lg ring-1 ring-emerald-300">
                     {getTempoCorrido()}
                   </span>
                 </div>
               </div>
             )}
          </div>
          
        </div>

        {/* Footer / Fechar */}
        <div className="pt-4 flex justify-end">
           <button 
             onClick={onClose}
             className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-neutral-900 text-white text-xs font-black uppercase tracking-widest shadow-xl hover:bg-black transition-all active:scale-95 flex items-center justify-center"
           >
             Entendi, Fechar
           </button>
        </div>

      </div>
    </Modal>
  );
}
