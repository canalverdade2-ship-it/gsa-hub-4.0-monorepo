import { FormEvent, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Clock,
  MapPin,
  Search,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { LogoGSA } from '../../components/ui/LogoGSA';
import { HomeLogoLink } from '../../components/ui/HomeLogoLink';
import { supabase } from '../../lib/supabase';
import { formatDate, maskCPF } from '../../lib/utils';
import { validarCPF } from '../../utils/cpfValidator';
import '../../careers.css';

interface CareersAccessPageProps {
  onBackToLanding: () => void;
  onBackToSite: () => void;
}

interface CareerApplicationPublic {
  protocol: string;
  candidate_name: string;
  desired_area: string;
  employment_type: 'clt' | 'estagio';
  status: CareerStatus;
  created_at: string;
  updated_at: string;
  status_changed_at?: string | null;
  interview_at?: string | null;
  interview_location?: string | null;
  public_message?: string | null;
}

type CareerStatus = 'received' | 'under_review' | 'interview_scheduled' | 'approved' | 'talent_pool' | 'rejected';

const STATUS_PRESENTATION: Record<CareerStatus, { label: string; className: string; icon: typeof Clock }> = {
  received: {
    label: 'Recebida — aguardando análise',
    className: 'border-[#b9cbbd] bg-[#edf4ef] text-[#31583a]',
    icon: Clock,
  },
  under_review: {
    label: 'Em análise',
    className: 'border-[#b8c7d8] bg-[#edf2f7] text-[#31516f]',
    icon: Search,
  },
  interview_scheduled: {
    label: 'Entrevista agendada',
    className: 'border-[#c9bdd7] bg-[#f2eef6] text-[#5f4476]',
    icon: CalendarClock,
  },
  approved: {
    label: 'Aprovada',
    className: 'border-[#d8c79f] bg-[#f7f2e6] text-[#715824]',
    icon: CheckCircle2,
  },
  talent_pool: {
    label: 'Banco de talentos',
    className: 'border-[#b8ceca] bg-[#edf5f3] text-[#2e5d56]',
    icon: UserCheck,
  },
  rejected: {
    label: 'Processo encerrado',
    className: 'border-[#d9b9b1] bg-[#f8efed] text-[#7a4035]',
    icon: AlertCircle,
  },
};

function normalizeProtocol(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export function CareersAccessPage({ onBackToLanding, onBackToSite }: CareersAccessPageProps) {
  const [protocol, setProtocol] = useState('');
  const [document, setDocument] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [application, setApplication] = useState<CareerApplicationPublic | null>(null);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();

    const normalizedProtocol = normalizeProtocol(protocol);
    const documentDigits = document.replace(/\D/g, '');

    if (!/^RH-\d{8}-[A-Z0-9]{6,12}$/.test(normalizedProtocol)) {
      toast.error('Informe um protocolo válido no formato RH-AAAAMMDD-CÓDIGO.');
      return;
    }
    if (!validarCPF(documentDigits)) {
      toast.error('Informe o mesmo CPF utilizado na candidatura.');
      return;
    }

    setLoading(true);
    setSearched(true);
    setApplication(null);

    try {
      const { data, error } = await supabase.rpc('gsa_public_get_career_application', {
        p_protocol: normalizedProtocol,
        p_document: documentDigits,
      });
      if (error) throw error;

      const result = data as { success?: boolean; application?: CareerApplicationPublic; code?: string } | null;
      if (!result?.success || !result.application) {
        toast.error('Candidatura não encontrada. Confira o protocolo e o CPF.');
        return;
      }

      setApplication(result.application);
      toast.success('Candidatura localizada com segurança.');
    } catch (error) {
      console.error('Erro ao consultar candidatura:', error);
      toast.error('Não foi possível consultar o banco de dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const status = application ? STATUS_PRESENTATION[application.status] || STATUS_PRESENTATION.received : null;
  const StatusIcon = status?.icon || Clock;

  return (
    <div className="career-page flex min-h-screen flex-col bg-[#f5f4f1] text-[#182235] selection:bg-[#c5a15a] selection:text-white">
      <header className="sticky top-0 z-50 border-b border-[#dedbd4] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <button
              type="button"
              onClick={onBackToLanding}
              className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[#536071] transition-colors hover:text-[#142030] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b68a3a] focus-visible:ring-offset-4"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Voltar ao Trabalhe Conosco</span>
              <span className="sm:hidden">Voltar</span>
            </button>
            <span className="hidden h-7 w-px bg-[#dedbd4] sm:block" aria-hidden="true" />
            <HomeLogoLink><LogoGSA size="sm" variant="dark" showText className="min-w-0" /></HomeLogoLink>
          </div>

          <button
            type="button"
            onClick={onBackToSite}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#142030] underline decoration-[#c5a15a] decoration-2 underline-offset-4 hover:text-[#9a712d]"
          >
            <span className="hidden sm:inline">Ir para o site</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b border-[#dedbd4] bg-white">
          <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:px-8 lg:py-18">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#9a712d]">Área do Candidato</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.035em] text-[#142030] sm:text-5xl">Acompanhe sua candidatura com segurança.</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#5e6977]">
              A consulta utiliza o protocolo oficial e o CPF informado no cadastro. Somente as informações públicas do processo são apresentadas nesta área.
            </p>
          </div>
        </section>

        <section>
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16 lg:px-8 lg:py-20">
            <aside className="self-start border-l-4 border-[#b68a3a] bg-[#142030] px-7 py-8 text-white sm:px-9 sm:py-10">
              <ShieldCheck className="h-7 w-7 text-[#dbc38e]" aria-hidden="true" />
              <h2 className="mt-5 text-2xl font-semibold">Tenha os dados do cadastro em mãos.</h2>
              <div className="mt-8 divide-y divide-white/15 border-y border-white/15">
                <div className="grid grid-cols-[2.5rem_1fr] gap-4 py-5">
                  <span className="font-mono text-sm text-[#dbc38e]">01</span>
                  <div>
                    <h3 className="font-semibold">Protocolo oficial</h3>
                    <p className="mt-1 text-sm leading-6 text-white/70">É o número apresentado depois da confirmação da candidatura.</p>
                  </div>
                </div>
                <div className="grid grid-cols-[2.5rem_1fr] gap-4 py-5">
                  <span className="font-mono text-sm text-[#dbc38e]">02</span>
                  <div>
                    <h3 className="font-semibold">CPF utilizado no envio</h3>
                    <p className="mt-1 text-sm leading-6 text-white/70">Os dois dados devem corresponder ao mesmo cadastro.</p>
                  </div>
                </div>
              </div>
              <p className="mt-7 text-sm leading-6 text-white/65">Currículos, documentos privados e observações internas não são exibidos nesta consulta.</p>
            </aside>

            <div>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 shadow-[0_18px_60px_rgba(20,32,48,0.08)] sm:p-9 lg:p-10">
                <div className="border-b border-[#dedbd4] pb-6">
                  <h2 className="text-2xl font-semibold text-[#142030]">Consultar candidatura</h2>
                  <p className="mt-2 text-sm leading-6 text-[#65707d]">Preencha exatamente os dados utilizados no envio do perfil.</p>
                </div>

                <form onSubmit={handleSearch} className="mt-7 grid gap-6 sm:grid-cols-2">
                  <label>
                    <span className="mb-2 block text-sm font-semibold text-[#2d394a]">Protocolo</span>
                    <input
                      value={protocol}
                      onChange={(event) => setProtocol(event.target.value)}
                      placeholder="RH-20260722-ABC123"
                      className="career-input"
                      autoComplete="off"
                    />
                    <span className="mt-2 block text-xs leading-5 text-[#7a8490]">Formato: RH-AAAAMMDD-CÓDIGO</span>
                  </label>
                  <label>
                    <span className="mb-2 block text-sm font-semibold text-[#2d394a]">CPF</span>
                    <input
                      value={document}
                      onChange={(event) => setDocument(maskCPF(event.target.value))}
                      placeholder="000.000.000-00"
                      className="career-input"
                      inputMode="numeric"
                      autoComplete="off"
                    />
                    <span className="mt-2 block text-xs leading-5 text-[#7a8490]">Use o mesmo CPF informado na candidatura.</span>
                  </label>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex min-h-[50px] items-center justify-center gap-2 bg-[#142030] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#243448] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b68a3a] focus-visible:ring-offset-4 sm:col-span-2 sm:justify-self-end"
                  >
                    <Search className="h-4 w-4" aria-hidden="true" />
                    {loading ? 'Consultando...' : 'Consultar candidatura'}
                  </button>
                </form>

                {searched && !loading && (
                  application && status ? (
                    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-9 border-t border-[#cfcac1] pt-8" aria-live="polite">
                      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#7d6841]">Protocolo confirmado</p>
                          <h3 className="mt-2 break-all font-mono text-xl font-semibold text-[#142030]">{application.protocol}</h3>
                        </div>
                        <span className={`inline-flex w-fit items-center gap-2 border px-3 py-2 text-xs font-semibold ${status.className}`}>
                          <StatusIcon className="h-4 w-4" aria-hidden="true" />
                          {status.label}
                        </span>
                      </div>

                      <dl className="mt-8 grid gap-x-8 gap-y-6 border-y border-[#dedbd4] py-7 sm:grid-cols-2">
                        <Info label="Candidato" value={application.candidate_name} />
                        <Info label="Área de interesse" value={application.desired_area} />
                        <Info label="Tipo de oportunidade" value={application.employment_type === 'estagio' ? 'Estágio' : 'Efetivo / CLT'} />
                        <Info label="Data de envio" value={formatDate(application.created_at)} />
                      </dl>

                      {application.status === 'interview_scheduled' && application.interview_at && (
                        <div className="mt-7 border-l-4 border-[#756087] bg-[#f2eef6] p-5">
                          <h4 className="font-semibold text-[#4f3b61]">Entrevista agendada</h4>
                          <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <div className="flex items-start gap-3">
                              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-[#665079]" aria-hidden="true" />
                              <div>
                                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6d5a79]">Data e horário</p>
                                <p className="mt-1 text-sm font-semibold text-[#34283d]">{new Date(application.interview_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-3">
                              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#665079]" aria-hidden="true" />
                              <div>
                                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6d5a79]">Local ou link</p>
                                <p className="mt-1 break-all text-sm font-semibold text-[#34283d]">{application.interview_location || 'A equipe responsável entrará em contato.'}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-7 flex items-start gap-3 bg-[#f3f1ec] p-5">
                        <Briefcase className="mt-0.5 h-5 w-5 shrink-0 text-[#9a712d]" aria-hidden="true" />
                        <div>
                          <h4 className="font-semibold text-[#142030]">Orientação atual</h4>
                          <p className="mt-2 text-sm leading-7 text-[#5e6977]">{application.public_message || 'A equipe responsável atualizará esta área quando houver uma nova informação sobre o processo.'}</p>
                        </div>
                      </div>
                    </motion.section>
                  ) : (
                    <div className="mt-9 border-l-4 border-[#9a4c3c] bg-[#f8efed] p-6 text-left" role="status">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#8a4639]" aria-hidden="true" />
                        <div>
                          <h3 className="font-semibold text-[#6f382f]">Nenhum registro foi localizado</h3>
                          <p className="mt-2 text-sm leading-6 text-[#745b56]">Confira se o protocolo e o CPF pertencem à mesma candidatura e tente novamente.</p>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </motion.div>

              <div className="mt-6 flex items-start gap-3 border-l-2 border-[#b68a3a] pl-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9a712d]" aria-hidden="true" />
                <p className="text-sm leading-6 text-[#65707d]">A consulta pública retorna somente os dados necessários para acompanhamento e não oferece acesso direto à tabela de candidaturas.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#293548] bg-[#111b29] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <LogoGSA size="sm" variant="light" showText />
          <p className="text-sm text-white/60">© {new Date().getFullYear()} GSA HUB — Área do Candidato.</p>
        </div>
      </footer>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[#7d8792]">{label}</dt>
      <dd className="mt-2 text-sm font-semibold text-[#142030]">{value}</dd>
    </div>
  );
}
