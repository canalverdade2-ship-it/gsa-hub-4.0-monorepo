import { ChangeEvent, FormEvent, type ReactNode, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  FileText,
  LockKeyhole,
  Send,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { LogoGSA } from '../../components/ui/LogoGSA';
import { HomeLogoLink } from '../../components/ui/HomeLogoLink';
import { supabase } from '../../lib/supabase';
import { copyToClipboard, handleCurrencyInputChange, maskCPF, maskCurrency, maskPhone } from '../../lib/utils';
import { validarCPF } from '../../utils/cpfValidator';
import '../../careers.css';

interface CareersLandingPageProps {
  onBackToSite: () => void;
  onAccessPortal: () => void;
}

interface SubmitResult {
  success?: boolean;
  already_exists?: boolean;
  protocol?: string;
  id?: string;
  resume_upload_path?: string | null;
  code?: string;
}

interface CareerVacancy {
  id: string;
  code: string;
  title: string;
  area: string;
  employment_type: 'clt' | 'estagio';
  work_mode: string;
  location: string;
  description: string;
  requirements?: string[];
  salary_min?: number | null;
  salary_max?: number | null;
}

type FormStep = 1 | 2 | 3;

const CAREER_BUCKET = 'gsa-careers-resumes';
const MAX_RESUME_SIZE = 10 * 1024 * 1024;

const CAREER_AREAS = [
  'Comercial & Vendas',
  'Tecnologia & Desenvolvimento',
  'Operações & Logística',
  'Suporte & Relacionamento',
  'Financeiro & Administração',
];

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const FAQ_ITEMS = [
  {
    question: 'O cadastro no banco de talentos garante uma entrevista?',
    answer: 'Não. O cadastro mantém seu perfil disponível para análise, mas não representa garantia de contato, entrevista ou contratação.',
  },
  {
    question: 'Como confirmo que o envio foi concluído?',
    answer: 'O sistema apresenta um protocolo somente depois que o banco de dados confirma o registro. Guarde esse número para consultar sua candidatura.',
  },
  {
    question: 'Posso consultar o andamento depois?',
    answer: 'Sim. Use a Área do Candidato e informe o protocolo recebido junto com o CPF utilizado no cadastro.',
  },
  {
    question: 'Quais arquivos são aceitos como currículo?',
    answer: 'São aceitos arquivos PDF, DOC, DOCX, JPG, PNG e WEBP com tamanho máximo de 10 MB.',
  },
] as const;

function resolveResumeMimeType(file: File): string {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  return MIME_BY_EXTENSION[extension] || '';
}

export function CareersLandingPage({ onBackToSite, onAccessPortal }: CareersLandingPageProps) {
  const [form, setForm] = useState({
    candidate_name: '',
    document: '',
    email: '',
    phone: '',
    desired_area: CAREER_AREAS[0],
    employment_type: 'clt' as 'clt' | 'estagio',
    salary_expectation: '',
    linkedin_url: '',
    notes: '',
  });
  const [currentStep, setCurrentStep] = useState<FormStep>(1);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [resumeWarning, setResumeWarning] = useState(false);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [vacancies, setVacancies] = useState<CareerVacancy[]>([]);
  const [selectedVacancyId, setSelectedVacancyId] = useState<string>('');

  useEffect(() => {
    const loadVacancies = async () => {
      try {
        const { data, error } = await supabase.rpc('gsa_public_list_career_vacancies');
        if (error) throw error;
        if (Array.isArray(data)) {
          setVacancies(data as CareerVacancy[]);
        }
      } catch (err) {
        console.warn('Falha ao carregar vagas públicas ativas:', err);
      }
    };
    void loadVacancies();
  }, []);

  const scrollToApplication = () => {
    document.getElementById('formulario-candidatura')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const validatePersonalData = () => {
    const candidateName = form.candidate_name.trim();
    const document = form.document.replace(/\D/g, '');
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.replace(/\D/g, '');

    if (candidateName.length < 3) {
      toast.error('Informe o nome completo do candidato.');
      return false;
    }
    if (!validarCPF(document)) {
      toast.error('Informe um CPF válido.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Informe um e-mail válido.');
      return false;
    }
    if (phone.length < 10 || phone.length > 13) {
      toast.error('Informe um telefone com DDD válido.');
      return false;
    }

    return true;
  };

  const goToNextStep = () => {
    if (currentStep === 1 && !validatePersonalData()) return;
    setCurrentStep((step) => Math.min(step + 1, 3) as FormStep);
  };

  const goToPreviousStep = () => {
    setCurrentStep((step) => Math.max(step - 1, 1) as FormStep);
  };

  const handleResumeUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const mimeType = resolveResumeMimeType(file);
    if (file.size <= 0 || file.size > MAX_RESUME_SIZE) {
      toast.error('O currículo deve possuir no máximo 10 MB.');
      event.target.value = '';
      return;
    }
    if (!Object.values(MIME_BY_EXTENSION).includes(mimeType)) {
      toast.error('Formato não permitido. Envie PDF, DOC, DOCX, JPG, PNG ou WEBP.');
      event.target.value = '';
      return;
    }

    setResumeFile(file);
    toast.success(`Currículo “${file.name}” anexado com sucesso.`);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!validatePersonalData()) {
      setCurrentStep(1);
      return;
    }

    if (!acceptedPrivacy) {
      toast.error('Confirme a autorização para o tratamento dos dados da candidatura.');
      return;
    }

    const candidateName = form.candidate_name.trim();
    const document = form.document.replace(/\D/g, '');
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.replace(/\D/g, '');

    setSubmitting(true);
    setResumeWarning(false);
    setAlreadyExists(false);

    try {
      const resumeMimeType = resumeFile ? resolveResumeMimeType(resumeFile) : null;
      const payload = {
        candidate_name: candidateName,
        document,
        email,
        phone,
        desired_area: form.desired_area,
        employment_type: form.employment_type,
        salary_expectation: form.salary_expectation ? Number(form.salary_expectation) : null,
        linkedin_url: form.linkedin_url.trim() || null,
        notes: form.notes.trim() || null,
        resume_file_name: resumeFile?.name || null,
        resume_mime_type: resumeMimeType,
        resume_size: resumeFile?.size || null,
        vacancy_id: selectedVacancyId || null,
      };

      const { data, error } = await supabase.rpc('gsa_public_submit_career_application', {
        p_payload: payload,
      });

      if (error) throw error;

      const result = (data || {}) as SubmitResult;
      if (!result.success || !result.protocol) {
        throw new Error('O banco não confirmou o registro da candidatura.');
      }

      let uploadFailed = false;
      if (resumeFile && result.resume_upload_path) {
        const { error: uploadError } = await supabase.storage
          .from(CAREER_BUCKET)
          .upload(result.resume_upload_path, resumeFile, {
            upsert: false,
            cacheControl: '3600',
            contentType: resumeMimeType || undefined,
          });

        if (uploadError) {
          console.error('Falha no upload seguro do currículo:', uploadError);
          uploadFailed = true;
        } else {
          const { data: confirmation, error: confirmationError } = await supabase.rpc(
            'gsa_public_confirm_career_resume',
            {
              p_protocol: result.protocol,
              p_document: document,
              p_storage_path: result.resume_upload_path,
            },
          );

          if (confirmationError || !(confirmation as { success?: boolean } | null)?.success) {
            console.error('Falha ao confirmar o currículo enviado:', confirmationError || confirmation);
            // Rollback storage upload
            await supabase.storage.from(CAREER_BUCKET).remove([result.resume_upload_path]);
            uploadFailed = true;
          }
        }
      }

      setProtocol(result.protocol);
      setResumeWarning(uploadFailed);
      setAlreadyExists(Boolean(result.already_exists));

      if (uploadFailed) {
        toast.error('Candidatura registrada, mas o currículo não foi anexado. Guarde o protocolo e contate o RH.');
      } else if (result.already_exists) {
        toast.success('Sua candidatura já estava registrada e foi localizada com segurança.');
      } else {
        toast.success('Candidatura registrada no banco de dados com sucesso!');
      }
    } catch (error) {
      console.error('Erro ao registrar candidatura:', error);
      toast.error('Não foi possível registrar a candidatura. Nenhum protocolo foi gerado. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="career-page min-h-screen bg-[#f3f0e9] text-[#172235] selection:bg-[#c39a4b] selection:text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0d1724]/95 text-white backdrop-blur-md">
        <div className="mx-auto flex h-[78px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <div className="flex min-w-0 items-center gap-5 sm:gap-7">
            <button
              type="button"
              onClick={onBackToSite}
              className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-white/70 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d2b06e] focus-visible:ring-offset-4 focus-visible:ring-offset-[#0d1724]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Voltar ao site</span>
            </button>
            <span className="hidden h-7 w-px bg-white/20 sm:block" aria-hidden="true" />
            <HomeLogoLink><LogoGSA size="sm" variant="light" showText className="min-w-0" /></HomeLogoLink>
          </div>

          <button
            type="button"
            onClick={onAccessPortal}
            className="inline-flex items-center gap-2 border border-[#d2b06e] px-4 py-2.5 text-sm font-semibold text-[#f0ddb5] transition-colors hover:bg-[#d2b06e] hover:text-[#0d1724] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-[#0d1724] sm:px-5"
          >
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Área do Candidato</span>
            <span className="sm:hidden">Acompanhar</span>
          </button>
        </div>
      </header>

      <main>
        <section className="career-hero relative overflow-hidden bg-[#0d1724] text-white">
          <div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-12 sm:px-8 sm:py-14 lg:grid-cols-[1fr_auto] lg:items-center lg:px-12 lg:py-16">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d2b06e]">Carreiras GSA HUB</p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-5xl lg:text-6xl">Faça parte da equipe GSA HUB.</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/75">Cadastre seu perfil no banco de talentos. Se surgir uma oportunidade compatível, nossa equipe poderá entrar em contato.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <button type="button" onClick={scrollToApplication} className="inline-flex min-h-12 items-center justify-center gap-2 bg-[#d2b06e] px-6 py-3 text-sm font-bold text-[#0d1724] transition-colors hover:bg-[#e2c98f] focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
                Cadastrar meu perfil <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={onAccessPortal} className="inline-flex min-h-12 items-center justify-center border border-white/30 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-[#0d1724] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d2b06e]">
                Consultar candidatura
              </button>
            </div>
          </div>
        </section>

        <section id="formulario-candidatura" className="scroll-mt-24 bg-[#e9e4d9] py-10 sm:py-14 lg:py-16">
          <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
            <div className="mx-auto max-w-4xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#9b722b]">Banco de talentos</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#172235] sm:text-4xl">Cadastre seu currículo</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[#626c77]">Preencha seus dados em três etapas. O protocolo será gerado após a confirmação do envio.</p>
            </div>

            <div className="career-application-shell mx-auto mt-8 max-w-5xl overflow-hidden bg-white shadow-[0_32px_90px_rgba(13,23,36,0.14)]">
              <div className="bg-[#0d1724] px-6 py-7 text-white sm:px-10 lg:px-12">
                <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d2b06e]">Ficha profissional</p>
                    <h3 className="mt-2 text-2xl font-semibold">Cadastro de candidatura</h3>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-white/60">
                    <ShieldCheck className="h-5 w-5 text-[#d2b06e]" aria-hidden="true" />
                    Ambiente protegido
                  </div>
                </div>

                <div className="mt-8 grid gap-2 sm:grid-cols-3">
                  {[
                    ['1', 'Identificação'],
                    ['2', 'Experiência'],
                    ['3', 'Confirmação'],
                  ].map(([number, label], index) => {
                    const step = (index + 1) as FormStep;
                    const active = currentStep === step;
                    const complete = currentStep > step;
                    return (
                      <button
                        key={number}
                        type="button"
                        onClick={() => {
                          if (step === 1 || currentStep > step || validatePersonalData()) setCurrentStep(step);
                        }}
                        className={`career-step-button flex items-center gap-3 border px-4 py-3 text-left transition-colors ${active ? 'border-[#d2b06e] bg-[#d2b06e] text-[#0d1724]' : complete ? 'border-white/20 bg-white/10 text-white' : 'border-white/20 text-white/60 hover:border-white/40 hover:text-white'}`}
                        aria-current={active ? 'step' : undefined}
                      >
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center border text-xs font-bold ${active ? 'border-[#0d1724]/25' : 'border-current'}`}>
                          {complete ? <Check className="h-4 w-4" aria-hidden="true" /> : number}
                        </span>
                        <span className="text-sm font-semibold">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <form onSubmit={handleSubmit} className="px-6 py-8 sm:px-10 sm:py-10 lg:px-14 lg:py-12">
                <div className="mb-8 flex items-end justify-between gap-4 border-b border-[#ddd7cb] pb-6">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9b722b]">Etapa {currentStep} de 3</p>
                    <h4 className="mt-2 text-2xl font-semibold text-[#172235]">
                      {currentStep === 1 ? 'Dados de identificação' : currentStep === 2 ? 'Perfil e experiência' : 'Currículo e autorização'}
                    </h4>
                  </div>
                  <span className="font-mono text-sm text-[#727b85]">{Math.round((currentStep / 3) * 100)}%</span>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                  >
                    {currentStep === 1 && (
                      <div className="grid gap-6 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <Field label="Nome completo" required>
                            <input
                              required
                              autoComplete="name"
                              value={form.candidate_name}
                              onChange={(event) => setForm({ ...form, candidate_name: event.target.value })}
                              className="career-input"
                              placeholder="Digite seu nome completo"
                            />
                          </Field>
                        </div>
                        <Field label="CPF" required>
                          <input
                            required
                            value={form.document}
                            onChange={(event) => setForm({ ...form, document: maskCPF(event.target.value) })}
                            className="career-input"
                            placeholder="000.000.000-00"
                            inputMode="numeric"
                          />
                        </Field>
                        <Field label="Telefone ou WhatsApp" required>
                          <input
                            required
                            type="tel"
                            autoComplete="tel"
                            value={form.phone}
                            onChange={(event) => setForm({ ...form, phone: maskPhone(event.target.value) })}
                            className="career-input"
                            placeholder="(11) 99999-9999"
                          />
                        </Field>
                        <div className="sm:col-span-2">
                          <Field label="E-mail" required>
                            <input
                              required
                              type="email"
                              autoComplete="email"
                              value={form.email}
                              onChange={(event) => setForm({ ...form, email: event.target.value })}
                              className="career-input"
                              placeholder="seuemail@exemplo.com"
                            />
                          </Field>
                        </div>
                      </div>
                    )}

                    {currentStep === 2 && (
                      <div className="grid gap-6 sm:grid-cols-2">
                        {vacancies.length > 0 && (
                          <div className="sm:col-span-2">
                            <Field label="Vaga específica (opcional)">
                              <select
                                value={selectedVacancyId}
                                onChange={(event) => {
                                  const vId = event.target.value;
                                  setSelectedVacancyId(vId);
                                  const found = vacancies.find((v) => v.id === vId);
                                  if (found) {
                                    setForm((prev) => ({
                                      ...prev,
                                      desired_area: found.area || prev.desired_area,
                                      employment_type: found.employment_type || prev.employment_type,
                                    }));
                                  }
                                }}
                                className="career-input"
                              >
                                <option value="">Banco de talentos geral (sem vaga específica)</option>
                                {vacancies.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.title} ({v.code}) — {v.area} [{v.work_mode}]
                                  </option>
                                ))}
                              </select>
                            </Field>
                          </div>
                        )}

                        <div className="sm:col-span-2">
                          <Field label="Área de interesse" required>
                            <select
                              value={form.desired_area}
                              onChange={(event) => setForm({ ...form, desired_area: event.target.value })}
                              className="career-input"
                            >
                              {CAREER_AREAS.map((area) => (
                                <option key={area} value={area}>{area}</option>
                              ))}
                            </select>
                          </Field>
                        </div>

                        <div className="sm:col-span-2">
                          <Field label="Tipo de oportunidade" required>
                            <div className="grid grid-cols-2 border border-[#bfc4ca] p-1">
                              {(['clt', 'estagio'] as const).map((type) => (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => setForm({ ...form, employment_type: type })}
                                  className={`min-h-12 px-4 text-sm font-semibold transition-colors ${form.employment_type === type ? 'bg-[#0d1724] text-white' : 'text-[#5e6977] hover:bg-[#f1eee8]'}`}
                                  aria-pressed={form.employment_type === type}
                                >
                                  {type === 'clt' ? 'Efetivo / CLT' : 'Estágio'}
                                </button>
                              ))}
                            </div>
                          </Field>
                        </div>

                        <Field label="Pretensão salarial">
                          <input
                            value={form.salary_expectation ? maskCurrency(form.salary_expectation) : ''}
                            onChange={(event) =>
                              handleCurrencyInputChange(event.target.value, (value) =>
                                setForm({ ...form, salary_expectation: value > 0 ? value.toString() : '' }),
                              )
                            }
                            className="career-input"
                            placeholder="R$ 0,00"
                            inputMode="numeric"
                          />
                        </Field>

                        <Field label="LinkedIn">
                          <input
                            type="url"
                            value={form.linkedin_url}
                            onChange={(event) => setForm({ ...form, linkedin_url: event.target.value })}
                            className="career-input"
                            placeholder="linkedin.com/in/seu-perfil"
                          />
                        </Field>

                        <div className="sm:col-span-2">
                          <Field label="Resumo profissional">
                            <textarea
                              rows={5}
                              maxLength={4000}
                              value={form.notes}
                              onChange={(event) => setForm({ ...form, notes: event.target.value })}
                              className="career-input"
                              placeholder="Apresente brevemente sua experiência, principais conhecimentos e objetivos profissionais."
                            />
                          </Field>
                        </div>
                      </div>
                    )}

                    {currentStep === 3 && (
                      <div className="space-y-7">
                        <Field label="Currículo">
                          <label className="career-file-upload">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center border border-[#cfc8bc] bg-[#f3f0e9] text-[#172235]">
                              {resumeFile ? <FileText className="h-5 w-5" aria-hidden="true" /> : <Upload className="h-5 w-5" aria-hidden="true" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <strong className="block truncate text-sm font-semibold text-[#172235]">
                                {resumeFile ? resumeFile.name : 'Selecionar arquivo do currículo'}
                              </strong>
                              <span className="mt-1 block text-sm leading-5 text-[#69737d]">
                                {resumeFile ? `${(resumeFile.size / (1024 * 1024)).toFixed(2)} MB — arquivo pronto para envio` : 'PDF, DOC, DOCX, JPG, PNG ou WEBP — máximo de 10 MB'}
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-semibold text-[#9b722b]">Escolher</span>
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                              onChange={handleResumeUpload}
                              className="sr-only"
                            />
                          </label>
                        </Field>

                        <div className="border-t border-[#ddd7cb] pt-6">
                          <label className="flex cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              checked={acceptedPrivacy}
                              onChange={(event) => setAcceptedPrivacy(event.target.checked)}
                              className="career-checkbox mt-1"
                            />
                            <span className="text-sm leading-7 text-[#5e6977]">
                              Autorizo o tratamento dos dados informados para análise do meu perfil e possível contato relacionado a oportunidades profissionais do GSA HUB. <strong className="font-semibold text-[#172235]">Obrigatório.</strong>
                            </span>
                          </label>
                        </div>

                        <div className="flex items-start gap-3 border-l-4 border-[#c39a4b] bg-[#f3f0e9] p-5">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#31583a]" aria-hidden="true" />
                          <p className="text-sm leading-7 text-[#596573]">Revise os dados antes de enviar. O protocolo só será exibido depois da confirmação do registro no banco de dados.</p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                <div className="mt-10 flex flex-col-reverse gap-3 border-t border-[#ddd7cb] pt-7 sm:flex-row sm:justify-between">
                  {currentStep > 1 ? (
                    <button
                      type="button"
                      onClick={goToPreviousStep}
                      className="inline-flex items-center justify-center gap-2 border border-[#bfc4ca] px-6 py-3.5 text-sm font-semibold text-[#172235] transition-colors hover:border-[#172235] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c39a4b] focus-visible:ring-offset-4"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      Voltar
                    </button>
                  ) : <span />}

                  {currentStep < 3 ? (
                    <button
                      type="button"
                      onClick={goToNextStep}
                      className="inline-flex items-center justify-center gap-2 bg-[#0d1724] px-7 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#263649] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c39a4b] focus-visible:ring-offset-4"
                    >
                      Continuar
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center justify-center gap-2 bg-[#0d1724] px-7 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#263649] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c39a4b] focus-visible:ring-offset-4"
                    >
                      <Send className="h-4 w-4" aria-hidden="true" />
                      {submitting ? 'Registrando candidatura...' : 'Enviar candidatura'}
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="mx-auto mt-8 flex max-w-5xl flex-col justify-between gap-4 border-t border-[#c9c2b5] pt-6 text-sm text-[#65707a] sm:flex-row sm:items-center">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#9b722b]" aria-hidden="true" /> Currículos armazenados em ambiente privado.</span>
              <span>O protocolo é gerado somente após confirmação do banco.</span>
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-[1100px] px-5 py-20 sm:px-8 lg:py-24">
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#9b722b]">Dúvidas frequentes</p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-[#172235] sm:text-5xl">Antes de enviar, confira.</h2>
            </div>

            <div className="mt-12 border-t border-[#c9c2b5]">
              {FAQ_ITEMS.map((item, index) => (
                <details key={item.question} className="career-faq group border-b border-[#c9c2b5]">
                  <summary className="grid cursor-pointer list-none grid-cols-[3rem_1fr_auto] items-center gap-4 py-7 text-left text-[#172235] sm:grid-cols-[4rem_1fr_auto] sm:py-8">
                    <span className="font-mono text-xs text-[#9b722b]">0{index + 1}</span>
                    <span className="text-base font-semibold sm:text-lg">{item.question}</span>
                    <ChevronDown className="h-5 w-5 shrink-0 text-[#9b722b] transition-transform" aria-hidden="true" />
                  </summary>
                  <p className="max-w-3xl pb-8 pl-[4rem] text-sm leading-7 text-[#5f6873] sm:pl-[5rem]">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#c39a4b] text-[#0d1724]">
          <div className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
            <div className="flex flex-col items-start justify-between gap-9 lg:flex-row lg:items-center">
              <div className="max-w-4xl">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0d1724]/60">Já enviou seu perfil?</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl lg:text-5xl">Seu protocolo mantém você conectado ao processo.</h2>
              </div>
              <button
                type="button"
                onClick={onAccessPortal}
                className="inline-flex shrink-0 items-center justify-center gap-2 bg-[#0d1724] px-7 py-4 text-sm font-bold text-white transition-colors hover:bg-[#263649] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-[#c39a4b]"
              >
                Acessar Área do Candidato
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      </main>

      <AnimatePresence>
        {protocol && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#07101c]/80 p-4" role="dialog" aria-modal="true" aria-labelledby="career-success-title">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 18 }}
              className="relative w-full max-w-lg bg-white p-7 shadow-2xl sm:p-10"
            >
              <button
                type="button"
                onClick={() => setProtocol(null)}
                className="absolute right-4 top-4 p-2 text-[#65707d] transition-colors hover:bg-[#f1eee8] hover:text-[#172235] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c39a4b]"
                aria-label="Fechar confirmação"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>

              <div className="flex h-12 w-12 items-center justify-center bg-[#e8efe9] text-[#31583a]">
                <BadgeCheck className="h-7 w-7" aria-hidden="true" />
              </div>

              <h3 id="career-success-title" className="mt-6 text-2xl font-semibold text-[#172235]">
                {alreadyExists ? 'Candidatura localizada' : 'Candidatura recebida'}
              </h3>

              <p className="mt-3 text-sm leading-7 text-[#5e6977]">
                {resumeWarning
                  ? 'Seu cadastro foi confirmado, mas o arquivo do currículo não pôde ser anexado. Guarde o protocolo e entre em contato com o atendimento.'
                  : alreadyExists
                    ? 'O sistema identificou que sua candidatura já estava registrada. Use o protocolo abaixo para acompanhar o cadastro existente.'
                    : 'Seu perfil foi registrado com sucesso. Guarde o protocolo abaixo para consultar o andamento na Área do Candidato.'}
              </p>

              <div className="mt-7 border border-[#cfc8bc] bg-[#f3f0e9] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#7d6841]">Protocolo de candidatura</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="break-all font-mono text-xl font-semibold text-[#172235]">{protocol}</p>
                  <button
                    type="button"
                    onClick={() => {
                      copyToClipboard(protocol);
                      toast.success('Protocolo copiado.');
                    }}
                    className="inline-flex shrink-0 items-center justify-center gap-2 border border-[#172235] px-4 py-2.5 text-sm font-semibold text-[#172235] transition-colors hover:bg-[#172235] hover:text-white"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Copiar
                  </button>
                </div>
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setProtocol(null);
                    onAccessPortal();
                  }}
                  className="bg-[#0d1724] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#263649]"
                >
                  Acompanhar candidatura
                </button>
                <button
                  type="button"
                  onClick={() => setProtocol(null)}
                  className="border border-[#bfc4ca] px-5 py-3 text-sm font-semibold text-[#172235] transition-colors hover:border-[#172235]"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="border-t border-white/10 bg-[#07101c] text-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-5 py-9 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
          <LogoGSA size="sm" variant="light" showText />
          <p className="text-sm text-white/50">© {new Date().getFullYear()} GSA HUB — Portal de Carreiras.</p>
        </div>
      </footer>
    </div>
  );
}

function Field({ label, children, required = false }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block text-left">
      <span className="mb-2 block text-sm font-semibold text-[#2d394a]">
        {label}
        {required && <span className="ml-1 text-[#9a4c3c]" aria-hidden="true">*</span>}
      </span>
      {children}
    </label>
  );
}
