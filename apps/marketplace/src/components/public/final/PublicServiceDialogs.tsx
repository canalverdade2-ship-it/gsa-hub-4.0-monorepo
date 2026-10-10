import { useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckSquare2,
  Layers3,
  LogIn,
  Mail,
  MessageCircle,
  Square,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AccessibleDialog } from '../../ui/AccessibleDialog';
import type { ServiceItem, ServicePackage } from '../../../data/publicServiceCatalog';

export interface ServicePackageRequest {
  package: ServicePackage;
  selectedServices: ServiceItem[];
  isFullPackage: boolean;
}

export function ServiceDetailsDialog({
  selectedPackage,
  onClose,
  onInterest,
}: {
  selectedPackage: ServicePackage | null;
  onClose: () => void;
  onInterest: (requestData: ServicePackageRequest) => void;
}) {
  const [selectedServiceNames, setSelectedServiceNames] = useState<string[]>([]);

  if (!selectedPackage) return null;

  const totalServices = selectedPackage.services.length;
  const isAllSelected = selectedServiceNames.length === totalServices;
  const isNoneSelected = selectedServiceNames.length === 0;

  const toggleService = (name: string) => {
    setSelectedServiceNames((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const selectAll = () => {
    setSelectedServiceNames(selectedPackage.services.map((s) => s.name));
  };

  const clearAll = () => {
    setSelectedServiceNames([]);
  };

  const handleRequest = (forceFullPackage = false) => {
    if (forceFullPackage || isNoneSelected || isAllSelected) {
      onInterest({
        package: selectedPackage,
        selectedServices: selectedPackage.services,
        isFullPackage: true,
      });
    } else {
      const filtered = selectedPackage.services.filter((s) => selectedServiceNames.includes(s.name));
      onInterest({
        package: selectedPackage,
        selectedServices: filtered,
        isFullPackage: false,
      });
    }
  };

  return (
    <AccessibleDialog
      isOpen={Boolean(selectedPackage)}
      onClose={onClose}
      ariaLabel={selectedPackage ? `Detalhes do pacote ${selectedPackage.title}` : 'Detalhes do pacote'}
      overlayClassName="items-center justify-center overflow-y-auto bg-[#03070d]/80 p-2 sm:p-4 backdrop-blur-md"
      panelClassName="max-h-[92dvh] w-[95vw] max-w-4xl overflow-hidden rounded-2xl sm:rounded-3xl border border-white/20 bg-white shadow-[0_28px_90px_rgba(0,0,0,0.45)]"
    >
      <div className="flex max-h-[92dvh] min-h-0 flex-col">
        {/* CABEÇALHO COMPACTO E ELEGANTE */}
        <header className="shrink-0 border-b border-white/10 bg-gradient-to-r from-[#070e17] via-[#0d1a29] to-[#070e17] px-4 py-2.5 sm:px-6 sm:py-3 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">

              <h2 className="mt-0.5 text-base sm:text-lg font-black leading-tight tracking-tight text-white truncate">
                {selectedPackage.title}
              </h2>
              {selectedPackage.description && (
                <p className="mt-0.5 text-[11px] sm:text-xs text-white/70 line-clamp-1 leading-snug">
                  {selectedPackage.description}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              data-dialog-autofocus
              aria-label="Fechar detalhes"
              className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8bd73]"
            >
              <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </div>
        </header>

        {/* ÁREA PRINCIPAL: LISTA DE SERVIÇOS AMPLA */}
        <section
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f8f6f1] px-4 py-3 sm:px-6 sm:py-3.5"
          aria-labelledby="included-services-title"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2dcd0] pb-2.5">
            <div>
              <h3 id="included-services-title" className="text-sm sm:text-base font-black tracking-tight text-[#101820]">
                Serviços incluídos no pacote
              </h3>
              <p className="text-[11px] sm:text-xs text-[#68737d]">
                Selecione os itens para solicitar individualmente ou solicite o pacote completo.
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="shrink-0 rounded-full border border-[#d8bd73]/40 bg-white px-2.5 py-0.5 text-[10px] sm:text-[11px] font-black text-[#6d5727] shadow-2xs">
                {selectedServiceNames.length > 0
                  ? `${selectedServiceNames.length} de ${totalServices} selecionados`
                  : `${totalServices} serviços disponíveis`}
              </span>
              
              {selectedServiceNames.length > 0 ? (
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg border border-[#d2c9b9] bg-white px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-[#5c6670] hover:bg-[#ede6d8] transition cursor-pointer"
                >
                  Limpar seleção
                </button>
              ) : (
                <button
                  type="button"
                  onClick={selectAll}
                  className="rounded-lg border border-[#d8bd73]/60 bg-[#f8f4ea] px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-[#806128] hover:bg-[#f0e8d5] transition cursor-pointer"
                >
                  Selecionar todos
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 sm:gap-2.5">
            {selectedPackage.services.map((service, index) => {
              const isSelected = selectedServiceNames.includes(service.name);

              return (
                <button
                  key={`${service.name}-${index}`}
                  type="button"
                  onClick={() => toggleService(service.name)}
                  className={`group flex items-start gap-2.5 sm:gap-3 rounded-xl sm:rounded-2xl border p-2.5 sm:p-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#806128] cursor-pointer ${
                    isSelected
                      ? 'border-[#c5a25d] bg-[#fcfaf5] shadow-[0_4px_14px_rgba(197,162,93,0.16)] ring-1 ring-[#c5a25d]'
                      : 'border-[#e0dad0] bg-white hover:border-[#cdb36d] hover:bg-[#faf8f4] shadow-[0_2px_8px_rgba(16,24,32,0.03)]'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-4.5 w-4.5 sm:h-5 sm:w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      isSelected
                        ? 'border-[#806128] bg-[#806128] text-white shadow-2xs'
                        : 'border-[#b8ad9c] bg-white group-hover:border-[#806128]'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 stroke-[3]" />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[9px] sm:text-[10px] font-black text-[#9b7c33]">
                        #{String(index + 1).padStart(2, '0')}
                      </span>
                      <h4 className="text-xs sm:text-sm font-black leading-snug text-[#101820]">
                        {service.name}
                      </h4>
                    </div>
                    {service.desc && (
                      <p className="mt-0.5 text-[11px] sm:text-xs leading-relaxed text-[#59646e]">
                        {service.desc}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* RODAPÉ COMPACTO E ELEGANTE */}
        <footer className="shrink-0 border-t border-[#e3ded4] bg-white px-4 py-2.5 sm:px-6 sm:py-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <div className="w-full sm:w-auto text-left">
              <p className="text-xs font-semibold text-[#5c6772]">
                {selectedServiceNames.length > 0 ? (
                  <>
                    <strong className="text-[#806128]">{selectedServiceNames.length}</strong>{' '}
                    {selectedServiceNames.length === 1 ? 'serviço individual selecionado' : 'serviços selecionados'}
                  </>
                ) : (
                  <>Solicitando o <strong>pacote completo</strong> ({totalServices} serviços).</>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {selectedServiceNames.length > 0 && selectedServiceNames.length < totalServices && (
                <button
                  type="button"
                  onClick={() => handleRequest(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#cfc4b2] bg-[#f8f5ee] px-3 py-2 text-xs font-bold text-[#6d5727] hover:bg-[#ede5d4] transition cursor-pointer"
                >
                  <Layers3 className="h-3.5 w-3.5" />
                  Pacote completo ({totalServices})
                </button>
              )}

              <button
                type="button"
                onClick={() => handleRequest(false)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0a1420] px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-black text-white shadow-sm transition hover:bg-[#806128] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a6e2f] active:scale-[0.99] cursor-pointer"
              >
                {selectedServiceNames.length > 0 && selectedServiceNames.length < totalServices ? (
                  <>
                    Solicitar {selectedServiceNames.length}{' '}
                    {selectedServiceNames.length === 1 ? 'serviço' : 'serviços'}
                  </>
                ) : (
                  <>Solicitar atendimento do pacote</>
                )}
                <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            </div>
          </div>
        </footer>
      </div>
    </AccessibleDialog>
  );
}

export function RequestChannelDialog({
  requestData,
  onClose,
  onWhatsApp,
  onEmail,
  onPortal,
}: {
  requestData: ServicePackageRequest | null;
  onClose: () => void;
  onWhatsApp: (item: ServicePackageRequest) => void;
  onEmail: (item: ServicePackageRequest) => void;
  onPortal: (item: ServicePackageRequest) => void;
}) {
  if (!requestData) return null;

  const { package: pkg, selectedServices, isFullPackage } = requestData;

  return (
    <AccessibleDialog
      isOpen={Boolean(requestData)}
      onClose={onClose}
      ariaLabel="Escolher canal de atendimento"
      overlayClassName="items-center justify-center overflow-y-auto bg-[#03070d]/80 p-2 sm:p-4 backdrop-blur-md"
      panelClassName="max-h-[92dvh] w-[95vw] max-w-lg overflow-hidden rounded-2xl sm:rounded-3xl border border-white/20 bg-white shadow-[0_28px_90px_rgba(0,0,0,0.45)]"
    >
      <div className="flex max-h-[92dvh] min-h-0 flex-col">
        {/* CABEÇALHO COMPACTO */}
        <header className="shrink-0 border-b border-white/10 bg-gradient-to-r from-[#070e17] via-[#0d1a29] to-[#070e17] px-4 py-2.5 sm:px-6 sm:py-3 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center rounded-full bg-[#d8bd73]/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#d8bd73] border border-[#d8bd73]/30">
                Canal de Atendimento
              </span>
              <h2 className="mt-0.5 text-base sm:text-lg font-black leading-tight text-white truncate">
                Escolha como deseja continuar
              </h2>
              <p className="text-[11px] text-white/70 truncate">
                Pacote: <strong className="text-white">{pkg.title}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              data-dialog-autofocus
              aria-label="Fechar canais de atendimento"
              className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8bd73]"
            >
              <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8f6f1] p-3.5 sm:p-5">
          {/* RESUMO DO ESCOPO SELECIONADO */}
          <div className="mb-3 rounded-xl sm:rounded-2xl border border-[#e2dacb] bg-white p-3 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#806128]">
                Escopo solicitado:
              </span>
              <span className="rounded-full border border-[#d8bd73]/50 bg-[#faf5e8] px-2.5 py-0.5 text-[10px] font-black text-[#6d5727]">
                {isFullPackage ? 'Pacote Completo' : `${selectedServices.length} serviço(s)`}
              </span>
            </div>

            <ul className="mt-2 space-y-1 border-t border-[#f0eae0] pt-2">
              {selectedServices.map((svc) => (
                <li key={svc.name} className="flex items-center gap-2 text-xs font-bold text-[#2a3642]">
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#142332] text-[#d8bd73] text-[9px]">
                    ✓
                  </span>
                  <span className="truncate">{svc.name}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <ChannelButton
              icon={MessageCircle}
              title="WhatsApp"
              description="Abertura e andamento automático no WhatsApp."
              badge="Instantâneo"
              onClick={() => onWhatsApp(requestData)}
            />
            <ChannelButton
              icon={Mail}
              title="E-mail"
              description="Envie sua solicitação por escrito."
              onClick={() => onEmail(requestData)}
            />
            <ChannelButton
              icon={LogIn}
              title="Portal do cliente"
              description="Registre e acompanhe sua solicitação."
              badge="Recomendado"
              onClick={() => onPortal(requestData)}
            />
          </div>
        </div>
      </div>
    </AccessibleDialog>
  );
}

function ChannelButton({
  icon: Icon,
  title,
  description,
  badge,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl border border-[#ddd8ce] bg-white p-3 text-left shadow-[0_2px_8px_rgba(16,24,32,0.03)] transition hover:border-[#cdb36d] hover:shadow-[0_4px_14px_rgba(16,24,32,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a6e2f] cursor-pointer"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0b1521] text-[#d8bd73] transition-colors group-hover:bg-[#806128] group-hover:text-white">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <strong className="text-xs sm:text-sm text-[#101820]">{title}</strong>
          {badge && (
            <span className="rounded-full bg-[#ede3c7] px-2 py-0.2 text-[8px] font-black uppercase tracking-wider text-[#6d5727]">
              {badge}
            </span>
          )}
        </span>
        <span className="block text-[11px] leading-tight text-neutral-600 mt-0.5">{description}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[#806729] transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

