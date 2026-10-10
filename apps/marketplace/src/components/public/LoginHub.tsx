import { ArrowRight, BriefcaseBusiness, Building2, KeyRound, PackageSearch, ShieldCheck, UserRound } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { InstitutionalAccessHero, InstitutionalAccessLayout } from './InstitutionalAccessLayout';

interface LoginHubProps {
  onBack?: () => void;
  onPersonalAccess: () => void;
  onBusinessAccess: () => void;
  onProviderAccess?: () => void;
  onSupplierAccess?: () => void;
  onRestrictedAccess?: () => void;
}

export function LoginHub({
  onBack,
  onPersonalAccess,
  onBusinessAccess,
  onProviderAccess,
  onSupplierAccess,
  onRestrictedAccess,
}: LoginHubProps) {
  const reduceMotion = useReducedMotion();
  const cardAnimation = reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

  return (
    <InstitutionalAccessLayout
      onBack={onBack}
      backLabel="Voltar ao site"
      skipTarget="login-options"
      footerNote="Ambiente institucional seguro"
    >
      <InstitutionalAccessHero
        eyebrow="GSA HUB · Acessos"
        title="Área Central de Login"
        description="Selecione o portal correspondente ao seu cadastro ou à sua relação com a GSA para continuar."
        aside={(
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#d5b86b]" />
            <p>
              Cada ambiente possui autenticação e permissões próprias. Nenhuma informação da conta é exibida antes da validação de acesso.
            </p>
          </div>
        )}
      />

      <section
        id="login-options"
        tabIndex={-1}
        className="px-5 py-12 focus:outline-none sm:px-8 lg:px-10 lg:py-16"
      >
        <div className="mx-auto w-full max-w-7xl">
          <div className="grid gap-5 border-b border-[#e2dbce] pb-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#806329]">Clientes GSA</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#0b1825] sm:text-4xl">
                Acessos para pessoas e empresas
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[#60666b] lg:justify-self-end">
              Use o mesmo tipo de cadastro informado na contratação dos serviços: CPF para pessoa física ou CNPJ para empresa.
            </p>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            <motion.button
              {...cardAnimation}
              transition={{ delay: 0.05 }}
              type="button"
              onClick={onPersonalAccess}
              className="group relative flex min-h-[220px] flex-col overflow-hidden rounded-2xl border border-[#e2dbce] bg-white p-6 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#806329] hover:shadow-lg focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#806329] sm:p-8"
            >
              <div className="flex w-full items-start justify-between gap-5">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f8f6f1] text-[#806329] transition-colors duration-300 group-hover:bg-[#806329] group-hover:text-white">
                  <UserRound className="h-6 w-6" />
                </span>
                <ArrowRight className="h-5 w-5 text-[#a89b82] transition-transform duration-300 group-hover:translate-x-1 group-hover:text-[#806329]" />
              </div>
              <div className="mt-auto pt-8">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#806329]">
                  Pessoa Física · PF
                </p>
                <h3 className="mt-3 text-xl font-semibold tracking-[-0.01em] text-[#101c27]">
                  Área do Cliente Pessoa Física — PF
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#666b70]">
                  Acesse com seu CPF e senha.
                </p>
              </div>
            </motion.button>

            <motion.button
              {...cardAnimation}
              transition={{ delay: 0.1 }}
              type="button"
              onClick={onBusinessAccess}
              className="group relative flex min-h-[220px] flex-col overflow-hidden rounded-2xl border border-[#e2dbce] bg-white p-6 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#806329] hover:shadow-lg focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#806329] sm:p-8"
            >
              <div className="flex w-full items-start justify-between gap-5">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f8f6f1] text-[#806329] transition-colors duration-300 group-hover:bg-[#806329] group-hover:text-white">
                  <Building2 className="h-6 w-6" />
                </span>
                <ArrowRight className="h-5 w-5 text-[#a89b82] transition-transform duration-300 group-hover:translate-x-1 group-hover:text-[#806329]" />
              </div>
              <div className="mt-auto pt-8">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#806329]">
                  Empresa · PJ
                </p>
                <h3 className="mt-3 text-xl font-semibold tracking-[-0.01em] text-[#101c27]">
                  Área do Cliente Empresa — PJ
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#666b70]">
                  Acesse o GSA HUB Empresas com seu CNPJ.
                </p>
              </div>
            </motion.button>
          </div>

          {(onProviderAccess || onSupplierAccess || onRestrictedAccess) && (
            <div className="mt-14">
              <div className="flex flex-col gap-3 border-b border-[#e2dbce] pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#806329]">Outros ambientes</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-[#0b1825]">
                    Portais operacionais
                  </h2>
                </div>
                <p className="text-sm text-[#666b70]">Selecione o vínculo correspondente.</p>
              </div>

              <div className="mt-6 grid gap-5 md:grid-cols-3">
                {onProviderAccess && (
                  <motion.button
                    {...cardAnimation}
                    transition={{ delay: 0.15 }}
                    type="button"
                    onClick={onProviderAccess}
                    className="group relative flex min-h-[160px] flex-col overflow-hidden rounded-2xl border border-[#e2dbce] bg-white p-5 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#806329] hover:shadow-md focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#806329] sm:p-6"
                  >
                    <div className="flex w-full items-start justify-between gap-4">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f8f6f1] text-[#806329] transition-colors duration-300 group-hover:bg-[#806329] group-hover:text-white">
                        <BriefcaseBusiness className="h-5 w-5" />
                      </span>
                      <ArrowRight className="h-4 w-4 text-[#a89b82] transition-transform duration-300 group-hover:translate-x-1 group-hover:text-[#806329]" />
                    </div>
                    <div className="mt-auto pt-6">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#806329]">Prestadores GSA</p>
                      <span className="mt-2 block text-[17px] font-semibold tracking-[-0.01em] text-[#0b1825]">Área do Prestador</span>
                    </div>
                  </motion.button>
                )}

                {onSupplierAccess && (
                  <motion.button
                    {...cardAnimation}
                    transition={{ delay: 0.2 }}
                    type="button"
                    onClick={onSupplierAccess}
                    className="group relative flex min-h-[160px] flex-col overflow-hidden rounded-2xl border border-[#e2dbce] bg-white p-5 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#806329] hover:shadow-md focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#806329] sm:p-6"
                  >
                    <div className="flex w-full items-start justify-between gap-4">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f8f6f1] text-[#806329] transition-colors duration-300 group-hover:bg-[#806329] group-hover:text-white">
                        <PackageSearch className="h-5 w-5" />
                      </span>
                      <ArrowRight className="h-4 w-4 text-[#a89b82] transition-transform duration-300 group-hover:translate-x-1 group-hover:text-[#806329]" />
                    </div>
                    <div className="mt-auto pt-6">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#806329]">Suprimentos GSA</p>
                      <span className="mt-2 block text-[17px] font-semibold tracking-[-0.01em] text-[#0b1825]">Portal do Fornecedor</span>
                    </div>
                  </motion.button>
                )}

                {onRestrictedAccess && (
                  <motion.button
                    {...cardAnimation}
                    transition={{ delay: 0.25 }}
                    type="button"
                    onClick={onRestrictedAccess}
                    className="group relative flex min-h-[160px] flex-col overflow-hidden rounded-2xl border border-[#e2dbce] bg-white p-5 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#806329] hover:shadow-md focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#806329] sm:p-6"
                  >
                    <div className="flex w-full items-start justify-between gap-4">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f8f6f1] text-[#806329] transition-colors duration-300 group-hover:bg-[#806329] group-hover:text-white">
                        <KeyRound className="h-5 w-5" />
                      </span>
                      <ArrowRight className="h-4 w-4 text-[#a89b82] transition-transform duration-300 group-hover:translate-x-1 group-hover:text-[#806329]" />
                    </div>
                    <div className="mt-auto pt-6">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#806329]">Equipe interna</p>
                      <span className="mt-2 block text-[17px] font-semibold tracking-[-0.01em] text-[#0b1825]">Acesso Restrito</span>
                      <span className="mt-1 block text-xs leading-5 text-[#666b70]">Exclusivo para Gestão e Colaborador GSA</span>
                    </div>
                  </motion.button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </InstitutionalAccessLayout>
  );
}
