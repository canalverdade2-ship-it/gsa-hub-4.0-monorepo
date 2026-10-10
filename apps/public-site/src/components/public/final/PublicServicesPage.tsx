import { useMemo } from 'react';
import { ArrowLeft, ArrowRight, MessageCircle } from 'lucide-react';
import type { Audience, ServicePackage } from '../../../data/publicServiceCatalog';

interface PublicServicesPageProps {
  audience: Audience;
  setAudience: (audience: Audience) => void;
  packages: ServicePackage[];
  initialCategory?: string;
  onBack: () => void;
  onWhatsAppRequest: (request: PublicServiceRequest) => void;
}

export interface PublicServiceRequest {
  audience: Audience;
  services: Array<{ category: string; name: string }>;
}

interface CatalogService {
  id: string;
  category: string;
  categoryLabel: string;
  name: string;
  description: string;
}

export function PublicServicesPage({ audience, setAudience, packages, onBack, onWhatsAppRequest }: PublicServicesPageProps) {

  const services = useMemo<CatalogService[]>(() => packages.flatMap((servicePackage) =>
    servicePackage.services.map((service, index) => ({
      id: `${servicePackage.id || servicePackage.title}-${service.id || service.name}-${index}`,
      category: servicePackage.title,
      categoryLabel: servicePackage.subtitle,
      name: service.name,
      description: service.desc,
    })),
  ), [packages]);

  const changeAudience = (nextAudience: Audience) => {
    if (nextAudience === audience) return;
    setAudience(nextAudience);
  };

  const requestService = (service: CatalogService) => {
    onWhatsAppRequest({
      audience,
      services: [{ category: service.categoryLabel, name: service.name }],
    });
  };

  return (
    <main className="min-h-screen bg-[#eee8dc] pb-28 pt-[74px] text-[#17202a] sm:pt-[84px]">
      <section className="border-b border-[#d8d0c3] bg-[#f7f3ea] px-4 pb-5 pt-4 sm:px-6 sm:py-7">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#d1c7b5] bg-white px-3.5 py-2 text-[11px] font-bold text-[#4f5962] transition hover:border-[#806128] hover:text-[#806128] sm:mb-4 sm:px-4 sm:text-xs">
              <ArrowLeft className="h-4 w-4" /> Voltar ao início
            </button>
            <h1 className="text-[1.8rem] leading-[1.08] font-black tracking-tight text-[#111820] sm:text-3xl">Encontre o serviço que precisa</h1>
            <p className="mt-2 text-[13px] leading-5 text-[#59636d] sm:text-sm">Toque em um serviço para iniciar seu atendimento pelo WhatsApp.</p>
          </div>
          <div className="inline-flex w-full rounded-full border border-[#cfc5b5] bg-white p-1 shadow-sm sm:w-fit" role="group" aria-label="Perfil do catálogo">
            <button type="button" onClick={() => changeAudience('PF')} aria-pressed={audience === 'PF'} className={`min-h-9 flex-1 rounded-full px-3 py-2 text-[11px] font-bold transition sm:flex-none sm:px-4 sm:text-xs ${audience === 'PF' ? 'bg-[#142332] text-white' : 'text-[#59636d] hover:bg-[#f3f0e8]'}`}>Pessoa física</button>
            <button type="button" onClick={() => changeAudience('PJ')} aria-pressed={audience === 'PJ'} className={`min-h-9 flex-1 rounded-full px-3 py-2 text-[11px] font-bold transition sm:flex-none sm:px-4 sm:text-xs ${audience === 'PJ' ? 'bg-[#142332] text-white' : 'text-[#59636d] hover:bg-[#f3f0e8]'}`}>Empresa</button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-7" aria-label="Serviços disponíveis">
        <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
          <h2 className="text-[15px] font-extrabold text-[#17202a] sm:text-base">Serviços disponíveis</h2>
          <span className="text-xs font-semibold text-[#626d77]">{services.length} serviços</span>
        </div>
        {services.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {services.map((service) => {
              return (
                <button key={service.id} type="button" onClick={() => requestService(service)} className="group flex min-h-[100px] w-full items-center gap-3 rounded-2xl border border-[#dcd3c5] bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#c5a25d] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#806128] sm:min-h-[108px] sm:p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#142332] text-[#d8bd73] transition group-hover:bg-[#806128] group-hover:text-white">
                    <MessageCircle className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#8a6b2f] sm:text-[10px]">{service.categoryLabel}</span>
                    <span className="mt-1 block text-[15px] font-extrabold text-[#111820] sm:text-sm">{service.name}</span>
                    <span className="mt-1 block text-[12px] leading-5 text-[#5a6570] sm:text-xs">{service.description}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[10px] font-extrabold text-[#806128] sm:text-xs"><span className="hidden sm:inline">Solicitar</span><ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#c8bda9] bg-white/70 p-8 text-center">
            <h3 className="text-base font-bold text-[#17202a]">Nenhum serviço disponível</h3>
            <p className="mt-1 text-sm text-[#68717a]">Não encontramos serviços para este perfil.</p>
          </div>
        )}
      </section>

    </main>
  );
}
