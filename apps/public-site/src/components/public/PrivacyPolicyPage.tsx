import { Mail, ShieldCheck } from 'lucide-react';

const CONTACT_EMAIL = 'gsa.doc.adm@gmail.com';

export function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#f3f0e8] pt-[73px] text-[#17202a]">
      <section className="border-b border-[#d8d0c2] bg-[#07111d] px-5 py-14 text-white sm:px-8 lg:px-10 lg:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#d5b86b]">GSA HUB · Privacidade</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">Política de Privacidade</h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-white/68 sm:text-lg">
            Saiba como tratamos os dados enviados pelo site e quais cuidados adotamos para proteger suas informações.
          </p>
        </div>
      </section>

      <section className="px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
        <div className="mx-auto max-w-5xl space-y-6">
          <article className="border border-[#d8d0c2] bg-white p-6 sm:p-8">
            <h2 className="text-2xl font-semibold text-[#0b1825]">Dados informados por você</h2>
            <p className="mt-4 leading-8 text-[#5b6268]">Usamos nome, documento, endereço, e-mail, telefone e a descrição da solicitação somente para cadastro, atendimento, orçamento, segurança e cumprimento das operações solicitadas.</p>
          </article>

          <article className="border border-[#d8d0c2] bg-white p-6 sm:p-8">
            <h2 className="text-2xl font-semibold text-[#0b1825]">Dados de navegação do formulário de orçamento</h2>            <p className="mt-4 leading-8 text-[#5b6268]">Podemos registrar a página acessada, o domínio de referência e parâmetros de campanha, como UTM, para identificar a origem do atendimento e medir campanhas. Esses dados não substituem autenticação e não são usados para criar uma sessão.</p>
          </article>

          <article className="border border-[#d8d0c2] bg-white p-6 sm:p-8">
            <h2 className="text-2xl font-semibold text-[#0b1825]">Segurança e compartilhamento</h2>
            <p className="mt-4 leading-8 text-[#5b6268]">Os dados ficam restritos às rotinas e equipes necessárias ao atendimento. Não vendemos os dados enviados pelo site. O acesso é protegido por controles de sessão, permissões, limites de tentativa e registros de auditoria.</p>
          </article>

          <article className="border border-[#d8d0c2] bg-white p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#806329]" />
              <div>
                <h2 className="text-2xl font-semibold text-[#0b1825]">Contato e correção</h2>
                <p className="mt-4 leading-8 text-[#5b6268]">Para consultar, corrigir ou solicitar a exclusão de informações públicas de atendimento, entre em contato pelo e-mail abaixo. Registros que precisem ser mantidos por obrigação operacional ou legal poderão ser preservados pelo prazo necessário.</p>
                <a href={`mailto:${CONTACT_EMAIL}`} className="mt-5 inline-flex items-center gap-2 font-bold text-[#806329] underline underline-offset-4"><Mail className="h-4 w-4" />{CONTACT_EMAIL}</a>
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
