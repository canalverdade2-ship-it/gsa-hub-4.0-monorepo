import { X, FileText, AlertCircle, ShieldCheck, Scale, Package, CreditCard, RefreshCw, Mail } from 'lucide-react';
import { AccessibleDialog } from '../ui/AccessibleDialog';

interface TermosDeUsoDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const SECTIONS = [
  {
    Icon: FileText,
    title: '1. Aceitação dos Termos',
    content:
      'Ao acessar ou utilizar o GSA HUB — Gestão de Serviços & Tecnologia ("Plataforma"), você concorda com estes Termos de Uso. Caso não concorde com alguma cláusula, você deve cessar o uso imediato da Plataforma. O uso continuado implica aceitação integral das condições aqui descritas.',
  },
  {
    Icon: Scale,
    title: '2. Elegibilidade e Cadastro',
    content:
      'A Plataforma é destinada a pessoas físicas maiores de 18 anos e a pessoas jurídicas devidamente constituídas. O usuário é responsável pela veracidade das informações fornecidas no cadastro. O GSA HUB pode suspender ou encerrar contas com dados incorretos ou incompletos.',
  },
  {
    Icon: Package,
    title: '3. Produtos, Serviços e Assinaturas',
    content:
      'O GSA HUB atua como intermediário entre compradores e fornecedores. As descrições, preços e condições dos produtos e serviços são de responsabilidade de cada fornecedor. Disponibilidade de estoque, prazos de entrega e especificações técnicas podem variar. O GSA HUB não garante a disponibilidade contínua de qualquer item do catálogo.',
  },
  {
    Icon: CreditCard,
    title: '4. Preços, Pagamentos e Taxas',
    content:
      'Os preços exibidos incluem os tributos aplicáveis, salvo indicação em contrário. Pagamentos podem ser realizados via Pix, cartão de crédito, crédito GSA ou outros meios disponíveis na Plataforma. O GSA HUB reserva-se o direito de alterar preços e condições a qualquer momento, sem aviso prévio, sendo aplicável o preço vigente no momento da confirmação do pedido.',
  },
  {
    Icon: RefreshCw,
    title: '5. Cancelamentos, Trocas e Devoluções',
    content:
      'O cliente pode cancelar pedidos de acordo com a política de cada produto ou serviço. Conforme o Código de Defesa do Consumidor (Lei nº 8.078/1990), compras realizadas fora do estabelecimento comercial podem ser canceladas em até 7 dias corridos após o recebimento. Para solicitar cancelamento, acesse a Central de Ajuda ou entre em contato com nosso suporte.',
  },
  {
    Icon: ShieldCheck,
    title: '6. Programa de Pontos e Benefícios VIP',
    content:
      'O Programa de Fidelidade GSA acumula pontos por compras e contratações realizadas na Plataforma. Pontos não possuem validade, mas podem ser alterados ou descontinuados mediante aviso de 30 dias. O resgate via Pix está sujeito a condições mínimas e verificação de identidade. Pontos não são transferíveis entre contas.',
  },
  {
    Icon: AlertCircle,
    title: '7. Limitação de Responsabilidade',
    content:
      'O GSA HUB não se responsabiliza por danos indiretos, incidentais ou consequentes decorrentes do uso da Plataforma. Nossa responsabilidade total está limitada ao valor pago pelo usuário na transação que originou o dano. O GSA HUB não garante que a Plataforma estará disponível de forma ininterrupta ou livre de erros.',
  },
  {
    Icon: Mail,
    title: '8. Contato e Jurisdição',
    content:
      'Para dúvidas, reclamações ou suporte, entre em contato pelo e-mail gsa.doc.adm@gmail.com ou pela Central de Ajuda da Plataforma. Estes Termos são regidos pela legislação brasileira. Fica eleito o foro da Comarca de São Paulo/SP para dirimir quaisquer controvérsias decorrentes deste instrumento.',
  },
];

export function TermosDeUsoDialog({ isOpen, onClose }: TermosDeUsoDialogProps) {
  return (
    <AccessibleDialog
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="termos-uso-title"
      panelClassName="max-w-3xl rounded-2xl bg-white shadow-2xl"
    >
      {/* Header fixo */}
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-2xl border-b border-gray-100 bg-white px-6 py-5 sm:px-8">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-[#17345f]">GSA HUB</p>
          <h2 id="termos-uso-title" className="mt-1 text-xl font-black text-gray-900 sm:text-2xl">
            Termos de Uso
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">Última atualização: janeiro de 2026</p>
        </div>
        <button
          type="button"
          data-dialog-autofocus
          onClick={onClose}
          aria-label="Fechar termos de uso"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17345f]"
        >
          <X size={18} />
        </button>
      </div>

      {/* Conteúdo rolável */}
      <div className="max-h-[65vh] overflow-y-auto px-6 py-6 sm:px-8">
        <p className="mb-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-relaxed text-blue-800">
          Estes Termos de Uso regulam a relação entre o <strong>GSA HUB</strong> e seus usuários.
          Leia com atenção antes de utilizar a Plataforma.
        </p>

        <div className="space-y-6">
          {SECTIONS.map(({ Icon, title, content }, i) => (
            <section key={i} className="flex gap-4">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#17345f]/8 text-[#17345f]">
                <Icon size={18} strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-900">{title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{content}</p>
              </div>
            </section>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-xs text-gray-500">
            Dúvidas? Fale conosco:{' '}
            <a href="mailto:gsa.doc.adm@gmail.com" className="font-bold text-[#17345f] hover:underline">
              gsa.doc.adm@gmail.com
            </a>
          </p>
        </div>
      </div>

      {/* Footer do modal */}
      <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-100 bg-gray-50 px-6 py-4 sm:px-8">
        <button
          onClick={onClose}
          className="rounded-xl bg-[#17345f] px-6 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#0f2342] cursor-pointer"
        >
          Entendi e Aceito
        </button>
      </div>
    </AccessibleDialog>
  );
}
