import { X } from 'lucide-react';
import { AccessibleDialog } from '../ui/AccessibleDialog';

interface PrivacyPolicyDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PrivacyPolicyDialog({ isOpen, onClose }: PrivacyPolicyDialogProps) {
  return (
    <AccessibleDialog
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="public-privacy-title"
      panelClassName="max-w-3xl rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8a6e2f]">Privacidade</p>
          <h2 id="public-privacy-title" className="mt-2 text-2xl font-black text-neutral-950">Como tratamos os dados enviados pelo site</h2>
        </div>
        <button type="button" data-dialog-autofocus onClick={onClose} aria-label="Fechar aviso de privacidade" className="rounded-lg bg-neutral-100 p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a6e2f]">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-6 space-y-5 text-sm leading-7 text-neutral-700">
        <section>
          <h3 className="font-black text-neutral-950">Dados informados por você</h3>
          <p>Usamos nome, documento, endereço, e-mail, telefone e a descrição da solicitação somente para cadastro, atendimento, orçamento, segurança e cumprimento das operações solicitadas.</p>
        </section>
        <section>
          <h3 className="font-black text-neutral-950">Dados de navegação do formulário de orçamento</h3>
          <p>Podemos registrar a página acessada, o domínio de referência e parâmetros de campanha, como UTM, para identificar a origem do atendimento e medir campanhas. Esses dados não substituem autenticação e não são usados para criar uma sessão.</p>
        </section>
        <section>
          <h3 className="font-black text-neutral-950">Segurança e compartilhamento</h3>
          <p>Os dados ficam restritos às rotinas e equipes necessárias ao atendimento. Não vendemos os dados enviados pelo site. O acesso é protegido por controles de sessão, permissões, limites de tentativa e registros de auditoria.</p>
        </section>
        <section>
          <h3 className="font-black text-neutral-950">Contato e correção</h3>
          <p>Para consultar, corrigir ou solicitar a exclusão de informações públicas de atendimento, entre em contato pelo e-mail gsa.doc.adm@gmail.com. Registros que precisem ser mantidos por obrigação operacional ou legal poderão ser preservados pelo prazo necessário.</p>
        </section>
      </div>
    </AccessibleDialog>
  );
}
