import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  LockKeyhole,
  MapPin,
  PackageSearch,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { LogoGSA } from '../../components/ui/LogoGSA';
import { PinInput } from '../../components/ui/PinInput';
import { logService } from '../../lib/logService';
import { sessionService } from '../../lib/sessionService';
import { supabase } from '../../lib/supabase';
import { maskCEP, maskCNPJ, maskCPF, maskPhone } from '../../lib/utils';
import { validarCNPJ, validarCPF, validarEmail } from '../../utils/cpfValidator';
import { consultarCEP } from '../../utils/viaCep';

type AccessMode = 'login' | 'register';
type LoginStage = 'document' | 'pin';

const EMPTY_SUPPLIER = {
  tipo_pessoa: 'pj' as 'pf' | 'pj',
  documento: '',
  razao_social: '',
  nome_fantasia: '',
  inscricao_estadual: '',
  responsavel_nome: '',
  email: '',
  telefone: '',
  cep: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
  observacoes: '',
};

interface FornecedorAccessPageProps {
  onLogin: (supplierId: string) => void;
  onBack: () => void;
}

function initialMode(): AccessMode {
  return new URLSearchParams(window.location.search).get('mode') === 'register' ? 'register' : 'login';
}

export function FornecedorAccessPage({ onLogin, onBack }: FornecedorAccessPageProps) {
  const [mode, setMode] = useState<AccessMode>(initialMode);
  const [stage, setStage] = useState<LoginStage>('document');
  const [documentValue, setDocumentValue] = useState('');
  const [pin, setPin] = useState('');
  const [form, setForm] = useState(EMPTY_SUPPLIER);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [consent, setConsent] = useState(false);

  const switchMode = (next: AccessMode) => {
    setMode(next);
    setStage('document');
    setPin('');
    setRegistered(false);
  };

  const continueLogin = (event: FormEvent) => {
    event.preventDefault();
    const clean = documentValue.replace(/\D/g, '');
    const valid = clean.length === 11 ? validarCPF(clean) : clean.length === 14 && validarCNPJ(clean);
    if (!valid) {
      toast.error('Informe um CPF ou CNPJ válido.');
      return;
    }
    setStage('pin');
  };

  const login = async () => {
    if (pin.length !== 4 || loading) return;
    setLoading(true);
    try {
      const data = await sessionService.loginWithPin(documentValue.replace(/\D/g, ''), pin, 'fornecedor');
      if (!data?.valid) {
        throw new Error(data?.error === 'blocked' ? 'Acesso temporariamente bloqueado.' : 'Documento, PIN ou cadastro inválido.');
      }
      await logService.logAction({
        ator_tipo: 'fornecedor',
        ator_id: data.id,
        ator_nome: data.nome,
        acao: 'LOGIN',
        detalhes: 'Acesso pela página exclusiva do fornecedor',
      });
      toast.success('Bem-vindo ao Portal do Fornecedor.');
      onLogin(data.id);
    } catch (error: any) {
      setPin('');
      toast.error(error?.message || 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  };

  const locateAddress = async (value: string) => {
    const masked = maskCEP(value);
    setForm((current) => ({ ...current, cep: masked }));
    const clean = value.replace(/\D/g, '');
    if (clean.length !== 8) return;

    const data = await consultarCEP(clean);
    if (!data) return;

    setForm((current) => ({
      ...current,
      cep: masked,
      endereco: data.logradouro || current.endereco,
      bairro: data.bairro || current.bairro,
      cidade: data.localidade || current.cidade,
      estado: data.uf || current.estado,
    }));
    toast.success('Endereço localizado pelo CEP.');
  };

  const register = async (event: FormEvent) => {
    event.preventDefault();
    const cleanDocument = form.documento.replace(/\D/g, '');
    const validDocument = form.tipo_pessoa === 'pf' ? validarCPF(cleanDocument) : validarCNPJ(cleanDocument);

    if (!validDocument) {
      toast.error('Informe um CPF ou CNPJ válido.');
      return;
    }
    if (!validarEmail(form.email)) {
      toast.error('Informe um e-mail válido.');
      return;
    }
    if (!consent) {
      toast.error('Confirme a veracidade dos dados antes de enviar.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc('gsa_public_register_supplier', {
        p_payload: {
          ...form,
          documento: cleanDocument,
          telefone: form.telefone.replace(/\D/g, ''),
          cep: form.cep.replace(/\D/g, ''),
        },
      });
      if (error) throw error;

      setRegistered(true);
      setForm(EMPTY_SUPPLIER);
      setConsent(false);
      toast.success('Pré-cadastro enviado para análise.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível enviar o cadastro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="supplier-access">
      <aside className="supplier-access__rail" aria-label="Informações sobre o portal">
        <div className="supplier-access__rail-content">
          <LogoGSA size="lg" variant="light" />
          <p className="supplier-access__eyebrow" style={{ marginTop: 52, color: '#d4a980' }}>
            Credenciamento comercial
          </p>
          <h1 className="supplier-access__rail-title">Acesso reservado à cadeia de fornecimento GSA.</h1>
          <p className="supplier-access__rail-lead">
            Empresas e profissionais homologados administram produtos, pedidos, entregas, notas fiscais e recebimentos em um ambiente próprio.
          </p>

          <div className="supplier-access__rail-list">
            <RailItem
              icon={ClipboardCheck}
              title="Análise cadastral"
              text="O acesso depende da conferência e aprovação dos dados enviados."
            />
            <RailItem
              icon={Truck}
              title="Operação rastreada"
              text="Pedidos e entregas permanecem vinculados ao histórico comercial."
            />
            <RailItem
              icon={ShieldCheck}
              title="Documentos protegidos"
              text="Notas fiscais e dados de pagamento são tratados em ambiente autenticado."
            />
          </div>
        </div>
      </aside>

      <section className="supplier-access__workspace">
        <div className="supplier-access__workspace-inner">
          <div className="supplier-access__topline">
            <button type="button" onClick={onBack} className="supplier-access__back">
              <ArrowLeft size={17} />
              Voltar ao Portal do Fornecedor
            </button>
            <div aria-hidden="true">
              <LogoGSA size="sm" variant="dark" />
            </div>
          </div>

          <header className="supplier-access__heading">
            <p className="supplier-access__eyebrow">
              {mode === 'login' ? 'Ambiente autenticado' : 'Solicitação de credenciamento'}
            </p>
            <h1>{mode === 'login' ? 'Acesso do fornecedor' : 'Cadastro comercial'}</h1>
            <p>
              {mode === 'login'
                ? 'Use o CPF ou CNPJ aprovado e o PIN de quatro dígitos liberado pela equipe GSA.'
                : 'Preencha os dados com atenção. O envio inicia uma análise e não representa aprovação automática.'}
            </p>
          </header>

          <div className="supplier-access__mode-switch" role="tablist" aria-label="Escolher forma de acesso">
            <ModeButton active={mode === 'login'} onClick={() => switchMode('login')}>
              Já sou fornecedor
            </ModeButton>
            <ModeButton active={mode === 'register'} onClick={() => switchMode('register')}>
              Solicitar cadastro
            </ModeButton>
          </div>

          {mode === 'login' && (
            <section className="supplier-access__panel" aria-labelledby="supplier-login-title">
              <div className="supplier-access__panel-header">
                <div>
                  <p className="supplier-access__section-label">Identificação</p>
                  <h2 id="supplier-login-title">Entrar no painel</h2>
                  <p>O documento identifica o cadastro. O PIN confirma o acesso ao ambiente operacional.</p>
                </div>
                <span className="supplier-access__panel-icon"><LockKeyhole size={21} /></span>
              </div>

              {stage === 'document' && (
                <form onSubmit={continueLogin} className="supplier-access__form">
                  <Field label="CPF ou CNPJ" hint="Informe o mesmo documento utilizado no credenciamento.">
                    <input
                      required
                      autoFocus
                      inputMode="numeric"
                      autoComplete="username"
                      value={documentValue}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, '');
                        setDocumentValue(digits.length <= 11 ? maskCPF(event.target.value) : maskCNPJ(event.target.value));
                      }}
                      placeholder="Documento cadastrado"
                    />
                  </Field>
                  <div className="supplier-access__notice">
                    O acesso somente será reconhecido quando o cadastro estiver ativo e o PIN já tiver sido liberado pela GSA.
                  </div>
                  <div className="supplier-access__actions">
                    <button type="submit" className="supplier-access__button-primary">
                      Continuar
                      <BadgeCheck size={17} />
                    </button>
                  </div>
                </form>
              )}

              {stage === 'pin' && (
                <div className="supplier-access__pin-wrap">
                  <div className="supplier-access__notice">
                    Documento confirmado. Digite agora o PIN de quatro dígitos vinculado ao cadastro.
                  </div>
                  <PinInput value={pin} onChange={setPin} disabled={loading} onEnter={login} />
                  <div className="supplier-access__actions">
                    <button
                      type="button"
                      onClick={() => {
                        setStage('document');
                        setPin('');
                      }}
                      className="supplier-access__button-secondary"
                    >
                      Alterar documento
                    </button>
                    <button
                      type="button"
                      disabled={loading || pin.length !== 4}
                      onClick={() => void login()}
                      className="supplier-access__button-primary"
                    >
                      {loading ? 'Validando acesso...' : 'Acessar portal'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {mode === 'register' && registered && (
            <section className="supplier-access__success" aria-live="polite">
              <CheckCircle2 size={34} />
              <h2>Solicitação recebida</h2>
              <p>
                Os dados foram enviados para análise da equipe GSA. Após a aprovação, o cadastro será ativado e o PIN de acesso será liberado pelos canais informados.
              </p>
              <button type="button" onClick={() => switchMode('login')} className="supplier-access__button-primary">
                Voltar para o acesso
              </button>
            </section>
          )}

          {mode === 'register' && !registered && (
            <section className="supplier-access__panel" aria-labelledby="supplier-register-title">
              <div className="supplier-access__panel-header">
                <div>
                  <p className="supplier-access__section-label">Dossiê cadastral</p>
                  <h2 id="supplier-register-title">Solicitar análise</h2>
                  <p>Campos obrigatórios devem corresponder aos documentos e canais oficiais do fornecedor.</p>
                </div>
                <span className="supplier-access__panel-icon"><Building2 size={21} /></span>
              </div>

              <form onSubmit={register} className="supplier-access__form">
                <div className="supplier-access__form-section">
                  <SectionTitle number="01" title="Identificação comercial" />
                  <div className="supplier-access__person-switch">
                    <button
                      type="button"
                      className={form.tipo_pessoa === 'pf' ? 'is-active' : ''}
                      onClick={() => setForm((current) => ({ ...current, tipo_pessoa: 'pf', documento: '', nome_fantasia: '', inscricao_estadual: '' }))}
                    >
                      Pessoa física
                    </button>
                    <button
                      type="button"
                      className={form.tipo_pessoa === 'pj' ? 'is-active' : ''}
                      onClick={() => setForm((current) => ({ ...current, tipo_pessoa: 'pj', documento: '' }))}
                    >
                      Pessoa jurídica
                    </button>
                  </div>

                  <Field label={form.tipo_pessoa === 'pj' ? 'Razão social' : 'Nome completo'}>
                    <input
                      required
                      value={form.razao_social}
                      onChange={(event) => setForm((current) => ({ ...current, razao_social: event.target.value }))}
                    />
                  </Field>

                  {form.tipo_pessoa === 'pj' && (
                    <div className="supplier-access__grid-2">
                      <TextField
                        label="Nome fantasia"
                        value={form.nome_fantasia}
                        onChange={(value) => setForm((current) => ({ ...current, nome_fantasia: value }))}
                      />
                      <TextField
                        label="Inscrição estadual"
                        value={form.inscricao_estadual}
                        onChange={(value) => setForm((current) => ({ ...current, inscricao_estadual: value }))}
                      />
                    </div>
                  )}

                  <div className="supplier-access__grid-2">
                    <TextField
                      label={form.tipo_pessoa === 'pj' ? 'CNPJ' : 'CPF'}
                      required
                      inputMode="numeric"
                      value={form.documento}
                      onChange={(value) => setForm((current) => ({
                        ...current,
                        documento: form.tipo_pessoa === 'pf' ? maskCPF(value) : maskCNPJ(value),
                      }))}
                    />
                    <TextField
                      label="Responsável pelo contato"
                      required
                      value={form.responsavel_nome}
                      onChange={(value) => setForm((current) => ({ ...current, responsavel_nome: value }))}
                    />
                  </div>
                </div>

                <div className="supplier-access__form-section">
                  <SectionTitle number="02" title="Contato oficial" />
                  <div className="supplier-access__grid-2">
                    <TextField
                      label="E-mail"
                      type="email"
                      required
                      value={form.email}
                      onChange={(value) => setForm((current) => ({ ...current, email: value }))}
                    />
                    <TextField
                      label="Telefone"
                      required
                      inputMode="tel"
                      value={form.telefone}
                      onChange={(value) => setForm((current) => ({ ...current, telefone: maskPhone(value) }))}
                    />
                  </div>
                </div>

                <div className="supplier-access__form-section">
                  <SectionTitle number="03" title="Endereço" />
                  <div className="supplier-access__grid-3">
                    <TextField label="CEP" inputMode="numeric" value={form.cep} onChange={(value) => void locateAddress(value)} />
                    <TextField label="Endereço" value={form.endereco} onChange={(value) => setForm((current) => ({ ...current, endereco: value }))} />
                    <TextField label="Número" value={form.numero} onChange={(value) => setForm((current) => ({ ...current, numero: value }))} />
                  </div>
                  <div className="supplier-access__grid-2">
                    <TextField label="Complemento" value={form.complemento} onChange={(value) => setForm((current) => ({ ...current, complemento: value }))} />
                    <TextField label="Bairro" value={form.bairro} onChange={(value) => setForm((current) => ({ ...current, bairro: value }))} />
                  </div>
                  <div className="supplier-access__grid-2">
                    <TextField label="Cidade" value={form.cidade} onChange={(value) => setForm((current) => ({ ...current, cidade: value }))} />
                    <TextField label="UF" value={form.estado} onChange={(value) => setForm((current) => ({ ...current, estado: value.toUpperCase().slice(0, 2) }))} />
                  </div>
                </div>

                <div className="supplier-access__form-section">
                  <SectionTitle number="04" title="Informações complementares" />
                  <Field label="Observações comerciais" hint="Informe categorias de produtos, regiões atendidas ou condições relevantes para a análise.">
                    <textarea
                      rows={4}
                      value={form.observacoes}
                      onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))}
                    />
                  </Field>
                  <label className="supplier-access__consent">
                    <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                    <span>Declaro que os dados informados são verdadeiros e podem ser utilizados pela GSA para análise cadastral e comercial.</span>
                  </label>
                </div>

                <div className="supplier-access__actions">
                  <button type="button" onClick={() => switchMode('login')} className="supplier-access__button-secondary">
                    Já possuo cadastro
                  </button>
                  <button type="submit" disabled={loading || !consent} className="supplier-access__button-primary">
                    <FileCheck2 size={17} />
                    {loading ? 'Enviando para análise...' : 'Enviar solicitação'}
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}

function RailItem({ icon: Icon, title, text }: { icon: typeof PackageSearch; title: string; text: string }) {
  return (
    <div className="supplier-access__rail-item">
      <Icon size={20} strokeWidth={1.7} />
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`supplier-access__mode-button${active ? ' is-active' : ''}`}
    >
      {children}
    </button>
  );
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <div className="supplier-access__form-section-title">
      <span>{number}</span>
      <h3>{title}</h3>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="supplier-access__field">
      <span>{label}</span>
      {hint && <small>{hint}</small>}
      {children}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <Field label={label}>
      <input
        type={type}
        required={required}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
