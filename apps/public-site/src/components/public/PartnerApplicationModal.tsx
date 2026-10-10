import { useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  Globe2,
  ImagePlus,
  MapPin,
  Send,
  UserRound,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { submitPartnerApplication } from '../../features/partners/service';
import type { PartnerApplicationData, PartnerServiceMode } from '../../features/partners/types';
import { maskCEP, maskCNPJ, maskCPF, maskPhone } from '../../lib/utils';
import { navigate } from '../../routing/navigationService';
import { validarCNPJ, validarCPF } from '../../utils/cpfValidator';
import { consultarCEP } from '../../utils/viaCep';

interface PartnerApplicationModalProps {
  open: boolean;
  onClose: () => void;
}

interface PartnerApplicationFormProps {
  onCancel: () => void;
}

const STEP_LABELS = ['Empresa', 'Contato', 'Atuação', 'Imagens e envio'];
const STEP_TITLES = [
  'Identificação da empresa ou profissional',
  'Responsável, contatos e localização',
  'Escopo de atuação e proposta de valor',
  'Presença digital, imagens e autorização',
];
const STEP_DESCRIPTIONS = [
  'Informe os dados que identificam formalmente a organização e apresente, de forma objetiva, o trabalho realizado.',
  'Cadastre o responsável pela solicitação e os canais que poderão ser utilizados durante a análise administrativa.',
  'Detalhe como a empresa atende, quais serviços oferece e o que pode acrescentar aos clientes e projetos da GSA HUB.',
  'Revise a presença digital, envie materiais visuais opcionais e confirme a autorização para tratamento dos dados.',
];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function formatTaxDocument(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length <= 11 ? maskCPF(digits) : maskCNPJ(digits);
}

function emptyApplication(startedAt = new Date().toISOString()): PartnerApplicationData {
  return {
    name: '', legal_name: '', tax_document: '', category: '', short_description: '', description: '',
    contact_person: '', phone: '', whatsapp: '', email: '', website: '', instagram: '', facebook: '', linkedin: '',
    street: '', number: '', complement: '', neighborhood: '', city: '', state: '', zip_code: '', business_hours: '',
    service_mode: 'hibrido', service_regions: [], services: [], products: [], benefits: '', privacy_consent: false,
    started_at: startedAt, company_website: '',
  };
}

function textToList(value: string): string[] {
  return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 30);
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function validateImage(file: File | null): string | null {
  if (!file) return null;
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return 'Envie somente imagens JPG, PNG ou WEBP.';
  if (file.size > MAX_IMAGE_BYTES) return 'Cada imagem deve ter no máximo 5 MB.';
  return null;
}

/**
 * Compatibilidade com os CTAs antigos da página de Parceiros.
 * Ao invés de abrir um modal, encaminha para a rota pública exclusiva.
 */
export function PartnerApplicationModal({ open }: PartnerApplicationModalProps) {
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    if (window.location.pathname !== '/nossos-parceiros/solicitar' && window.location.pathname !== '/parceiros/solicitar') {
      navigate('/nossos-parceiros/solicitar');
    }
  }, [open]);

  return null;
}

export function PartnerApplicationForm({ onCancel }: PartnerApplicationFormProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<PartnerApplicationData>(() => emptyApplication());
  const [regionsText, setRegionsText] = useState('');
  const [servicesText, setServicesText] = useState('');
  const [productsText, setProductsText] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [loadingCep, setLoadingCep] = useState(false);

  const update = <K extends keyof PartnerApplicationData>(field: K, value: PartnerApplicationData[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleZipCodeChange = async (rawValue: string) => {
    const masked = maskCEP(rawValue);
    update('zip_code', masked);
    const clean = onlyDigits(rawValue);
    if (clean.length !== 8) return;

    setLoadingCep(true);
    try {
      const data = await consultarCEP(clean);
      if (!data) {
        toast.error('CEP não encontrado. Preencha o endereço manualmente.');
        return;
      }
      setForm((current) => ({
        ...current,
        zip_code: masked,
        street: data.logradouro || current.street,
        neighborhood: data.bairro || current.neighborhood,
        city: data.localidade || current.city,
        state: data.uf || current.state,
      }));
      toast.success('Endereço localizado pelo CEP.');
    } catch (error) {
      console.error('Erro na consulta de CEP:', error);
      toast.error('Não foi possível consultar o CEP. Continue o preenchimento manualmente.');
    } finally {
      setLoadingCep(false);
    }
  };

  const logoPreview = useMemo(() => logoFile ? URL.createObjectURL(logoFile) : null, [logoFile]);
  const coverPreview = useMemo(() => coverFile ? URL.createObjectURL(coverFile) : null, [coverFile]);

  useEffect(() => () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    if (coverPreview) URL.revokeObjectURL(coverPreview);
  }, [logoPreview, coverPreview]);

  const validateCurrentStep = (): boolean => {
    if (step === 0) {
      const documentDigits = onlyDigits(form.tax_document);
      if (form.name.trim().length < 2) return fail('Informe o nome da empresa ou profissional.');
      if (form.legal_name.trim().length < 2) return fail('Informe a razão social ou o nome completo.');
      if (documentDigits.length === 11) {
        if (!validarCPF(documentDigits)) return fail('CPF informado é inválido.');
      } else if (documentDigits.length === 14) {
        if (!validarCNPJ(documentDigits)) return fail('CNPJ informado é inválido.');
      } else {
        return fail('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido para análise cadastral.');
      }
      if (form.category.trim().length < 2) return fail('Informe a categoria de atuação.');
      if (form.short_description.trim().length < 3) return fail('Informe uma breve apresentação ou descrição do parceiro.');
    }

    if (step === 1) {
      if (form.contact_person.trim().length < 2) return fail('Informe o responsável pela solicitação.');
      if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return fail('Informe um e-mail válido.');
      if (onlyDigits(form.whatsapp).length < 10) return fail('Informe um WhatsApp válido com DDD (mínimo 10 dígitos).');
      if (form.phone && onlyDigits(form.phone).length < 10) return fail('Informe um telefone válido com DDD (mínimo 10 dígitos).');
      if (form.zip_code && onlyDigits(form.zip_code).length !== 8) return fail('Informe um CEP válido (8 dígitos).');
      if (form.city.trim().length < 2 || form.state.trim().length !== 2) return fail('Informe cidade e estado (UF com 2 letras).');
    }

    if (step === 2) {
      if (textToList(servicesText).length === 0) return fail('Informe pelo menos um serviço ou especialidade.');
      if (form.business_hours.trim().length < 3) return fail('Informe o horário de atendimento.');
    }

    if (step === 3) {
      const logoError = validateImage(logoFile);
      const coverError = validateImage(coverFile);
      if (logoError || coverError) return fail(logoError || coverError || 'Imagem inválida.');
      if (!form.privacy_consent) return fail('É necessário autorizar o tratamento dos dados para enviar a solicitação.');
    }
    return true;
  };

  const next = () => {
    if (!validateCurrentStep()) return;
    setStep((current) => Math.min(current + 1, STEP_LABELS.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const previous = () => {
    setStep((current) => Math.max(current - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateCurrentStep()) return;

    setSending(true);
    try {
      const result = await submitPartnerApplication({
        ...form,
        tax_document: onlyDigits(form.tax_document),
        phone: onlyDigits(form.phone),
        whatsapp: onlyDigits(form.whatsapp),
        zip_code: onlyDigits(form.zip_code),
        state: form.state.trim().toUpperCase().slice(0, 2),
        service_regions: textToList(regionsText),
        services: textToList(servicesText),
        products: textToList(productsText),
      }, logoFile, coverFile);
      setProtocol(result.protocol);
      toast.success('Solicitação enviada para análise.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      console.error('Erro ao enviar solicitação de parceria:', error);
      toast.error(error?.message || 'Não foi possível enviar sua solicitação.');
    } finally {
      setSending(false);
    }
  };

  if (protocol) {
    return (
      <div className="partner-application-success partner-application-success--page">
        <div className="partner-application-success__mark"><CheckCircle2 aria-hidden="true" /></div>
        <p className="partners-kicker">Registro concluído</p>
        <h2>Recebemos sua solicitação.</h2>
        <p>Os dados foram enviados ao sistema da GSA HUB e ficaram com o status <strong>Em análise</strong>. A publicação não é automática: a equipe responsável revisará as informações antes de qualquer aprovação.</p>
        <div className="partner-protocol-box">
          <div><span>Protocolo da solicitação</span><strong>{protocol}</strong></div>
          <FileCheck2 aria-hidden="true" />
        </div>
        <button type="button" onClick={onCancel} className="partner-primary-button">Voltar ao diretório</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="partner-application-form partner-application-form--page">
      <div className="partner-application-intro">
        <p>Preencha as quatro etapas com informações verdadeiras e atualizadas. O envio gera protocolo, passa por análise administrativa e não publica o perfil automaticamente.</p>
        <div><strong>Tempo de preenchimento</strong><span>Aproximadamente 8 a 12 minutos, conforme o nível de detalhamento.</span></div>
      </div>

      <div className="partner-application-progress" aria-label="Etapas do formulário">
        {STEP_LABELS.map((label, index) => (
          <div key={label} className={index < step ? 'is-complete' : index === step ? 'is-current' : ''} aria-current={index === step ? 'step' : undefined}>
            <span>{String(index + 1).padStart(2, '0')}</span><strong>{label}</strong>
          </div>
        ))}
      </div>

      <div className="partner-application-step-heading">
        <span>{String(step + 1).padStart(2, '0')}</span>
        <div><h3>{STEP_TITLES[step]}</h3><p>{STEP_DESCRIPTIONS[step]}</p></div>
      </div>

      {step === 0 && (
        <FormSection icon={<Building2 aria-hidden="true" />} title="Dados da empresa ou profissional">
          <div className="partner-form-grid partner-form-grid--2">
            <Field label="Nome comercial" required value={form.name} onChange={(value) => update('name', value)} maxLength={160} />
            <Field label="Razão social ou nome completo" required value={form.legal_name} onChange={(value) => update('legal_name', value)} maxLength={180} />
            <Field label="CPF ou CNPJ" required value={form.tax_document} onChange={(value) => update('tax_document', formatTaxDocument(value))} maxLength={18} inputMode="numeric" placeholder="000.000.000-00 ou 00.000.000/0000-00" help="O documento é usado somente na análise cadastral e não aparece no perfil público." />
            <Field label="Categoria de atuação" required value={form.category} onChange={(value) => update('category', value)} placeholder="Ex.: Saúde, Contabilidade, Tecnologia" maxLength={100} />
          </div>
          <div className="partner-form-grid">
            <Area label="Descrição curta" required value={form.short_description} onChange={(value) => update('short_description', value)} rows={3} maxLength={280} placeholder="Resuma o que sua empresa oferece e seu principal diferencial." help="Este texto poderá ser utilizado na apresentação resumida do diretório." />
            <Area label="Apresentação completa" value={form.description} onChange={(value) => update('description', value)} rows={5} maxLength={4000} placeholder="Apresente experiência, estrutura, diferenciais e forma de trabalho." />
          </div>
        </FormSection>
      )}

      {step === 1 && (
        <>
          <FormSection icon={<UserRound aria-hidden="true" />} title="Responsável pela solicitação">
            <div className="partner-form-grid partner-form-grid--2">
              <Field label="Nome do responsável" required value={form.contact_person} onChange={(value) => update('contact_person', value)} maxLength={160} />
              <Field label="E-mail" required type="email" value={form.email} onChange={(value) => update('email', value)} maxLength={180} placeholder="exemplo@empresa.com.br" />
              <Field label="Telefone" value={form.phone} onChange={(value) => update('phone', maskPhone(value))} inputMode="tel" maxLength={15} placeholder="(00) 0000-0000" />
              <Field label="WhatsApp" required value={form.whatsapp} onChange={(value) => update('whatsapp', maskPhone(value))} inputMode="tel" maxLength={15} placeholder="(00) 00000-0000" />
            </div>
          </FormSection>
          <FormSection icon={<MapPin aria-hidden="true" />} title="Endereço e localização">
            <div className="partner-form-grid partner-form-grid--address">
              <Field label={loadingCep ? 'CEP — consultando' : 'CEP'} value={form.zip_code} onChange={handleZipCodeChange} inputMode="numeric" maxLength={9} placeholder="00000-000" />
              <Field label="Rua ou avenida" value={form.street} onChange={(value) => update('street', value)} maxLength={180} />
              <Field label="Número" value={form.number} onChange={(value) => update('number', value)} maxLength={30} />
            </div>
            <div className="partner-form-grid partner-form-grid--2">
              <Field label="Complemento" value={form.complement} onChange={(value) => update('complement', value)} maxLength={100} />
              <Field label="Bairro" value={form.neighborhood} onChange={(value) => update('neighborhood', value)} maxLength={100} />
              <Field label="Cidade" required value={form.city} onChange={(value) => update('city', value)} maxLength={100} />
              <Field label="Estado" required value={form.state} onChange={(value) => update('state', value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2))} maxLength={2} placeholder="SP" />
            </div>
          </FormSection>
        </>
      )}

      {step === 2 && (
        <FormSection icon={<BriefcaseBusiness aria-hidden="true" />} title="Atuação, serviços e benefícios">
          <div className="partner-form-grid partner-form-grid--2">
            <label className="partner-field"><span>Modalidade de atendimento</span><select value={form.service_mode} onChange={(event) => update('service_mode', event.target.value as PartnerServiceMode)} className="partner-input"><option value="presencial">Presencial</option><option value="online">On-line</option><option value="hibrido">Presencial e on-line</option></select></label>
            <Field label="Horário de atendimento" required value={form.business_hours} onChange={(value) => update('business_hours', value)} placeholder="Ex.: Segunda a sexta, das 8h às 18h" maxLength={180} />
          </div>
          <div className="partner-form-grid"><Area label="Regiões atendidas — uma por linha" value={regionsText} onChange={setRegionsText} rows={3} maxLength={1500} placeholder={'Atibaia e região\nTodo o Brasil on-line'} /></div>
          <div className="partner-form-grid partner-form-grid--2">
            <Area label="Serviços e especialidades — um por linha" required value={servicesText} onChange={setServicesText} rows={6} maxLength={3000} help="Informe pelo menos um serviço. Cada linha será tratada como um item independente." />
            <Area label="Produtos e soluções — um por linha" value={productsText} onChange={setProductsText} rows={6} maxLength={3000} />
          </div>
          <div className="partner-form-grid"><Area label="Benefício ou condição especial para clientes GSA" value={form.benefits} onChange={(value) => update('benefits', value)} rows={3} maxLength={1200} placeholder="Descreva somente condições que possam ser confirmadas e mantidas pela empresa." /></div>
        </FormSection>
      )}

      {step === 3 && (
        <>
          <FormSection icon={<Globe2 aria-hidden="true" />} title="Presença digital">
            <div className="partner-form-grid partner-form-grid--2">
              <Field label="Site" value={form.website} onChange={(value) => update('website', value)} maxLength={300} placeholder="https://" />
              <Field label="Instagram" value={form.instagram} onChange={(value) => update('instagram', value)} maxLength={300} placeholder="https://instagram.com/..." />
              <Field label="Facebook" value={form.facebook} onChange={(value) => update('facebook', value)} maxLength={300} placeholder="https://facebook.com/..." />
              <Field label="LinkedIn" value={form.linkedin} onChange={(value) => update('linkedin', value)} maxLength={300} placeholder="https://linkedin.com/..." />
            </div>
          </FormSection>
          <FormSection icon={<ImagePlus aria-hidden="true" />} title="Logotipo e foto de apresentação">
            <div className="partner-image-grid">
              <ImageField label="Logotipo" file={logoFile} preview={logoPreview} onChange={setLogoFile} help="JPG, PNG ou WEBP, até 5 MB. Prefira fundo limpo e boa definição." />
              <ImageField label="Foto de capa" file={coverFile} preview={coverPreview} onChange={setCoverFile} help="Imagem horizontal recomendada, em JPG, PNG ou WEBP, até 5 MB." />
            </div>
          </FormSection>
          <label className="partner-consent"><input type="checkbox" checked={form.privacy_consent} onChange={(event) => update('privacy_consent', event.target.checked)} /><span>Autorizo a GSA HUB a receber, armazenar e analisar os dados enviados para fins de avaliação da parceria. Estou ciente de que o envio não garante aprovação ou publicação automática.</span></label>
          <div className="hidden" aria-hidden="true"><label>Site da empresa<input tabIndex={-1} autoComplete="off" value={form.company_website} onChange={(event) => update('company_website', event.target.value)} /></label></div>
        </>
      )}

      <div className="partner-form-actions">
        <button type="button" disabled={sending} onClick={step === 0 ? onCancel : previous} className="partner-secondary-button">{step === 0 ? 'Cancelar' : <><ChevronLeft aria-hidden="true" />Voltar</>}</button>
        {step < STEP_LABELS.length - 1 ? (
          <button type="button" onClick={next} className="partner-primary-button">Continuar<ChevronRight aria-hidden="true" /></button>
        ) : (
          <button type="submit" disabled={sending} className="partner-gold-button"><Send aria-hidden="true" />{sending ? 'Enviando solicitação...' : 'Enviar para análise'}</button>
        )}
      </div>
    </form>
  );
}

function fail(message: string): false {
  toast.error(message);
  return false;
}

function FormSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <section className="partner-form-section"><header className="partner-form-section__heading">{icon}<h4>{title}</h4></header><div className="partner-form-grid">{children}</div></section>;
}

function Field({ label, value, onChange, required = false, type = 'text', maxLength, placeholder, inputMode, help }: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; maxLength?: number;
  placeholder?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; help?: string;
}) {
  return <label className="partner-field"><span>{label}{required ? ' *' : ''}</span><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} placeholder={placeholder} inputMode={inputMode} className="partner-input" />{help && <small>{help}</small>}</label>;
}

function Area({ label, value, onChange, rows, required = false, maxLength, placeholder, help }: {
  label: string; value: string; onChange: (value: string) => void; rows: number; required?: boolean; maxLength?: number; placeholder?: string; help?: string;
}) {
  return <label className="partner-field"><span>{label}{required ? ' *' : ''}</span><textarea required={required} value={value} onChange={(event) => onChange(event.target.value)} rows={rows} maxLength={maxLength} placeholder={placeholder} className="partner-input" />{help && <small>{help}</small>}</label>;
}

function ImageField({ label, file, preview, onChange, help }: { label: string; file: File | null; preview: string | null; onChange: (file: File | null) => void; help: string }) {
  return <label className="partner-image-field"><strong>{label}</strong><div className="partner-image-field__preview">{preview ? <img src={preview} alt={`Prévia de ${label}`} /> : <ImagePlus aria-hidden="true" />}</div><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onChange(event.target.files?.[0] || null)} /><small>{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : help}</small></label>;
}
