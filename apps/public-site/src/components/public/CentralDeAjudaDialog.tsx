import { X, HelpCircle, MessageCircle, ChevronDown, ChevronRight, Phone, Mail, FileText, ShoppingCart, CreditCard, Package, RefreshCw, Trophy } from 'lucide-react';
import { useState } from 'react';
import { AccessibleDialog } from '../ui/AccessibleDialog';
import { navigate } from '../../routing/navigationService';
import { routes } from '../../routing/routeCatalog';

interface CentralDeAjudaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clientId?: string;
}

const FAQ_ITEMS = [
  {
    Icon: ShoppingCart,
    category: 'Compras & Pedidos',
    color: '#2563eb',
    bg: '#eff6ff',
    questions: [
      {
        q: 'Como faço um pedido na GSA Store?',
        a: 'Encontre o produto desejado, clique em "Ver detalhes", escolha a quantidade e finalize o pedido. Você pode pagar via Pix, cartão de crédito ou crédito GSA.',
      },
      {
        q: 'Posso acompanhar meu pedido em tempo real?',
        a: 'Sim! Acesse "Minha Conta" → "Pedidos" para ver o status atualizado de cada pedido, desde a confirmação até a entrega.',
      },
      {
        q: 'Qual é o prazo de entrega?',
        a: 'O prazo varia por produto e região. O tempo estimado é exibido antes de você finalizar a compra. Após confirmação do pagamento, o prazo começa a contar.',
      },
    ],
  },
  {
    Icon: CreditCard,
    category: 'Pagamentos & Cobranças',
    color: '#16a34a',
    bg: '#f0fdf4',
    questions: [
      {
        q: 'Quais formas de pagamento são aceitas?',
        a: 'Aceitamos Pix (desconto especial), Cartão de Crédito em até 10× sem juros, e Crédito GSA (saldo da sua carteira na plataforma).',
      },
      {
        q: 'Meu pagamento foi recusado. O que faço?',
        a: 'Verifique os dados do cartão, limite disponível e se o banco não bloqueou a transação. Se persistir, tente outro método de pagamento ou entre em contato com nosso suporte.',
      },
      {
        q: 'Como funciona o Pix na GSA Store?',
        a: 'Ao escolher Pix, você recebe um QR Code ou chave de pagamento. Após confirmação do Pix, seu pedido é processado automaticamente em segundos.',
      },
    ],
  },
  {
    Icon: RefreshCw,
    category: 'Trocas & Devoluções',
    color: '#d97706',
    bg: '#fffbeb',
    questions: [
      {
        q: 'Como solicitar a devolução de um produto?',
        a: 'Acesse "Minha Conta" → "Pedidos" → selecione o pedido → clique em "Solicitar Devolução". Você tem até 7 dias após o recebimento para solicitar (Lei do CDC).',
      },
      {
        q: 'Em quanto tempo recebo o reembolso?',
        a: 'Após aprovação da devolução: Pix em até 2 dias úteis; Cartão de crédito em até 2 faturas. O prazo de análise da devolução é de até 3 dias úteis.',
      },
    ],
  },
  {
    Icon: Trophy,
    category: 'Programa de Pontos VIP',
    color: '#7c3aed',
    bg: '#f5f3ff',
    questions: [
      {
        q: 'Como funciona o acúmulo de pontos GSA?',
        a: 'A cada R$ 1,00 gasto em compras ou serviços você ganha 1 ponto GSA base (R$ 1 = 1 ponto), com multiplicadores para membros VIP. Os pontos não expiram.',
      },
      {
        q: 'Como resgato meus pontos?',
        a: 'Acesse "Minha Conta" → "Programa de Pontos" → "Resgatar". Você pode converter em saldo na sua carteira GSA e sacar via Pix para sua conta bancária.',
      },
      {
        q: 'Como subo de nível no programa VIP?',
        a: 'Seu nível sobe automaticamente conforme acumula pontos por compras e contratações. Confira os critérios de cada nível na página do Programa VIP.',
      },
    ],
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50 transition-colors hover:border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left cursor-pointer"
      >
        <span className="text-xs font-bold text-gray-900 pr-4">{q}</span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180 text-[#17345f]' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 text-xs leading-relaxed text-gray-600">
          {a}
        </div>
      )}
    </div>
  );
}

export function CentralDeAjudaDialog({ isOpen, onClose, clientId }: CentralDeAjudaDialogProps) {
  const [activeCategory, setActiveCategory] = useState(0);

  const handleOpenTickets = () => {
    onClose();
    if (clientId) {
      navigate(routes.client.support());
    } else {
      navigate(routes.login.personal());
    }
  };

  return (
    <AccessibleDialog
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="ajuda-title"
      panelClassName="max-w-3xl rounded-2xl bg-white shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 rounded-t-2xl border-b border-gray-100 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#17345f] text-white">
            <HelpCircle size={20} />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-[#17345f]">GSA HUB</p>
            <h2 id="ajuda-title" className="text-xl font-black text-gray-900 sm:text-2xl">
              Central de Ajuda
            </h2>
          </div>
        </div>
        <button
          type="button"
          data-dialog-autofocus
          onClick={onClose}
          aria-label="Fechar central de ajuda"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17345f]"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="max-h-[65vh] overflow-y-auto px-6 py-6 sm:px-8">

        {/* Category tabs */}
        <div className="mb-5 flex flex-wrap gap-2">
          {FAQ_ITEMS.map((cat, i) => {
            const isActive = activeCategory === i;
            return (
              <button
                key={i}
                onClick={() => setActiveCategory(i)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'shadow-sm scale-105'
                    : 'border-gray-200 bg-gray-50 text-gray-500 hover:text-gray-700'
                }`}
                style={isActive ? { backgroundColor: cat.bg, borderColor: cat.color + '40', color: cat.color } : {}}
              >
                <cat.Icon size={13} />
                {cat.category}
              </button>
            );
          })}
        </div>

        {/* FAQ items for selected category */}
        <div className="space-y-2">
          {FAQ_ITEMS[activeCategory].questions.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} />
          ))}
        </div>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Não encontrou sua resposta?</p>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        {/* Contact options */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              Icon: MessageCircle,
              label: 'Abrir Chamado',
              sub: 'Suporte por ticket',
              color: '#17345f',
              bg: '#eff6ff',
              action: handleOpenTickets,
            },
            {
              Icon: Mail,
              label: 'E-mail',
              sub: 'gsa.doc.adm@gmail.com',
              color: '#16a34a',
              bg: '#f0fdf4',
              action: () => { window.location.href = 'mailto:gsa.doc.adm@gmail.com'; },
            },
            {
              Icon: FileText,
              label: 'Ver todos os tickets',
              sub: 'Histórico de suporte',
              color: '#7c3aed',
              bg: '#f5f3ff',
              action: handleOpenTickets,
            },
          ].map(({ Icon, label, sub, color, bg, action }, i) => (
            <button
              key={i}
              onClick={action}
              className="group flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4 text-left transition-all hover:scale-[1.02] hover:border-gray-200 hover:shadow-sm cursor-pointer"
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors"
                style={{ backgroundColor: bg, color }}
              >
                <Icon size={18} strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-xs font-black text-gray-900">{label}</p>
                <p className="text-[10px] text-gray-500">{sub}</p>
              </div>
              <ChevronRight size={14} className="ml-auto text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>

      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 rounded-b-2xl border-t border-gray-100 bg-gray-50 px-6 py-4 sm:px-8">
        <p className="text-[11px] text-gray-400">
          Horário de atendimento: Seg–Sex 8h–18h (Brasília)
        </p>
        <button
          onClick={onClose}
          className="rounded-xl border border-gray-300 bg-white px-5 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-50 cursor-pointer"
        >
          Fechar
        </button>
      </div>
    </AccessibleDialog>
  );
}
