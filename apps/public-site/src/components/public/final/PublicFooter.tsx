import { Mail, MessageCircle } from 'lucide-react';
import { LogoGSA } from '../../ui/LogoGSA';
import type { PublicPage } from '../../../data/publicServiceCatalog';
import { routes } from '../../../routing/routeCatalog';
import { navigate } from '../../../routing/navigationService';

const WHATSAPP_NUMBER = '5511920857756';
const CONTACT_EMAIL = 'gsa.doc.adm@gmail.com';

interface PublicFooterProps {
  setPublicPage: (page: PublicPage) => void;
  onGuestStore?: () => void;
  onAdminLogin: () => void;
  onPrivacyNotice?: () => void;
}

export function PublicFooter({ setPublicPage, onGuestStore, onAdminLogin, onPrivacyNotice }: PublicFooterProps) {
  return (
    <footer className="border-t border-white/10 bg-neutral-950 py-10 text-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 md:grid-cols-2 lg:grid-cols-3 lg:px-8">
        <div>
          <LogoGSA size="lg" variant="light" />
          <p className="mt-4 text-sm leading-6 text-white/55">Serviços, assinaturas, produtos e tecnologia em um único hub.</p>
        </div>
        <nav aria-label="Links do rodapé">
          <h2 className="text-xs font-black uppercase tracking-widest text-white/35">Ambientes</h2>
          <div className="mt-4 flex flex-col gap-3 text-sm font-bold text-white/75">
            <button type="button" onClick={() => setPublicPage('free-tools')} className="w-fit hover:text-[#d8bd73]">Serviços Gratuitos</button>
            <button type="button" onClick={() => setPublicPage('services')} className="w-fit hover:text-[#d8bd73]">Serviços e Assinaturas</button>
            <button type="button" onClick={onGuestStore} className="w-fit hover:text-[#d8bd73]">Marketplace</button>
            <button type="button" onClick={() => setPublicPage('systems')} className="w-fit hover:text-[#d8bd73]">Sites e Sistemas</button>
            <button type="button" onClick={() => setPublicPage('partners')} className="w-fit hover:text-[#d8bd73]">Nossos Parceiros</button>
            <button type="button" onClick={onAdminLogin} className="w-fit hover:text-[#d8bd73]">Acesso Restrito</button>
            <a href="/afiliados" className="w-fit hover:text-[#d8bd73]">Programa de Afiliados</a>
            <a href="/trabalhe-conosco" className="w-fit hover:text-[#d8bd73]">Trabalhe Conosco</a>
            <button type="button" onClick={() => onPrivacyNotice ? onPrivacyNotice() : navigate(routes.public.privacy())} className="w-fit hover:text-[#d8bd73]">Privacidade</button>
          </div>
        </nav>
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-white/35">Contato</h2>
          <div className="mt-4 flex flex-col gap-3 text-sm font-bold text-white/75">
            <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-[#d8bd73]"><MessageCircle className="h-5 w-5" />WhatsApp</a>
            <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-center gap-2 hover:text-[#d8bd73]"><Mail className="h-5 w-5" />{CONTACT_EMAIL}</a>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-12 max-w-7xl border-t border-white/10 px-4 pt-8 sm:px-6 lg:px-8">
        <p className="text-center text-xs leading-5 text-white/55">
          &copy; {new Date().getFullYear()} GSA HUB — Gestão de Serviços &amp; Tecnologia. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
