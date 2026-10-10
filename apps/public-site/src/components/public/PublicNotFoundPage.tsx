import { ArrowLeft, Compass, Home as HomeIcon } from 'lucide-react';
import { navigate } from '../../routing/navigationService';
import { routes } from '../../routing/routeCatalog';

export function PublicNotFoundPage({ pathname }: { pathname?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f7f5] px-6">
      <div className="w-full max-w-xl rounded-3xl border border-neutral-100 bg-white p-10 text-center shadow-sm">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-500">GSA HUB</p>
        <h1 className="mt-3 text-5xl font-black text-neutral-900">404</h1>
        <h2 className="mt-3 text-lg font-bold text-neutral-800">Página não encontrada</h2>
        <p className="mt-2 text-sm font-medium leading-relaxed text-neutral-500">
          O endereço {pathname ? <span className="font-bold text-neutral-700">{pathname}</span> : 'solicitado'} não existe
          ou foi movido. Use os atalhos abaixo para continuar navegando.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => navigate(routes.public.home())}
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-5 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-neutral-800"
          >
            <HomeIcon className="h-4 w-4" /> Ir para o site
          </button>
          <button
            onClick={() => navigate(routes.marketplace.root())}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-5 py-3 text-xs font-black uppercase tracking-wider text-neutral-700 transition hover:border-indigo-200 hover:text-indigo-600"
          >
            <Compass className="h-4 w-4" /> Explorar marketplace
          </button>
          <button
            onClick={() => (typeof window !== 'undefined' ? window.history.back() : undefined)}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-5 py-3 text-xs font-black uppercase tracking-wider text-neutral-700 transition hover:border-neutral-300"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
        </div>
      </div>
    </div>
  );
}

export default PublicNotFoundPage;
