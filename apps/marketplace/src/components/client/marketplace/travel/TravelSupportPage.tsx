import React from 'react';
import { ArrowLeft, Clock, Headphones, Mail, MessageCircle, ShieldCheck } from 'lucide-react';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';

const WHATSAPP_NUMBER = '5511920857756';
const SUPPORT_EMAIL = 'gsa.doc.adm@gmail.com';

export function TravelSupportPage({
  clientId,
  onBack,
}: {
  clientId?: string;
  onBack: () => void;
}) {
  const whatsappMessage = encodeURIComponent('Olá! Preciso de ajuda com o GSA Viagens.');

  return (
    <div className="min-h-screen bg-[#f4f1ea] pb-24 font-sans">
      <nav className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#f4f1ea]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-5">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-[#0c2340]">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar</span>
          </button>
          <div className="mx-4 h-5 w-px bg-black/10" />
          <span className="text-sm font-black text-[#0c2340]">Suporte GSA Viagens</span>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-5 py-12">
        <section className="overflow-hidden rounded-[2rem] bg-[#0c2340] p-8 text-white shadow-xl sm:p-12">
          <div className="max-w-3xl">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-[#38bdf8]">Atendimento especializado</p>
            <h1 className="text-4xl font-black leading-tight sm:text-5xl" style={{ fontFamily: '"Cinzel", serif' }}>
              Estamos com você em cada etapa da viagem.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/70">
              Tire dúvidas sobre propostas, pagamentos, documentos, emissão, alterações e cancelamentos.
            </p>
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-3">
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappMessage}`}
            target="_blank"
            rel="noreferrer"
            className="group rounded-3xl border border-black/5 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
          >
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <MessageCircle className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-black text-[#0c2340]">WhatsApp</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-500">Fale diretamente com a equipe para dúvidas rápidas e acompanhamento.</p>
            <span className="mt-5 inline-block text-sm font-black text-emerald-600 group-hover:underline">Iniciar conversa</span>
          </a>

          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Suporte%20GSA%20Viagens`}
            className="group rounded-3xl border border-black/5 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
          >
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
              <Mail className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-black text-[#0c2340]">E-mail</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-500">Envie documentos complementares ou uma descrição detalhada da solicitação.</p>
            <span className="mt-5 inline-block break-all text-sm font-black text-sky-600 group-hover:underline">{SUPPORT_EMAIL}</span>
          </a>

          <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <Headphones className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-black text-[#0c2340]">Portal do Cliente</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-500">Clientes cadastrados podem registrar e acompanhar chamados pelo portal.</p>
            {clientId ? (
              <button onClick={() => navigate(routes.client.support())} className="mt-5 text-sm font-black text-indigo-600 hover:underline">Abrir atendimento</button>
            ) : (
              <button onClick={() => navigate(routes.login.client())} className="mt-5 text-sm font-black text-indigo-600 hover:underline">Entrar no portal</button>
            )}
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2">
          <div className="rounded-3xl border border-black/5 bg-white p-7">
            <h2 className="flex items-center gap-2 text-xl font-black text-[#0c2340]"><Clock className="h-5 w-5 text-[#168ac1]" /> Prazo de atendimento</h2>
            <p className="mt-3 text-sm leading-7 text-neutral-600">Solicitações comuns recebem retorno em até 48 horas úteis. Casos próximos ao embarque são priorizados conforme urgência e disponibilidade dos fornecedores.</p>
          </div>
          <div className="rounded-3xl border border-black/5 bg-white p-7">
            <h2 className="flex items-center gap-2 text-xl font-black text-[#0c2340]"><ShieldCheck className="h-5 w-5 text-[#168ac1]" /> Segurança</h2>
            <p className="mt-3 text-sm leading-7 text-neutral-600">Não envie senhas, códigos de autenticação ou dados completos de cartão. Documentos de passageiros devem ser anexados apenas na área privada da viagem.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
