import React, { useState } from 'react';
import { ArrowRight, Hash, LockKeyhole, LogIn, ShieldCheck } from 'lucide-react';
import { signInPortal } from '../../auth';

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'client';
  clientId?: string | number | null;
};

export interface LoginScreenProps {
  onAuthenticated: (user: AuthUser) => void;
}

export default function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const isClientPortal = /\/cliente(?:\/|$)/.test(typeof window !== 'undefined' ? window.location.pathname : '');
  const [login, setLogin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const user = await signInPortal(isClientPortal
        ? { portal: 'client', login }
        : { portal: 'admin', email, password });
      onAuthenticated(user as AuthUser);
    } catch (requestError: any) {
      setError(requestError?.message || (isClientPortal ? 'Não foi possível entrar. Confira o prefixo do CPF/CNPJ.' : 'Não foi possível entrar. Confira seu e-mail e sua senha.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: '#f1f5f9'
      }}
    >
      <section
        aria-labelledby="login-title"
        style={{
          width: 'min(100%, 430px)',
          padding: 32,
          borderRadius: 20,
          background: '#ffffff',
          border: '1px solid #dbe5f0',
          boxShadow: '0 20px 50px rgba(15, 23, 42, 0.12)'
        }}
      >
        <div
          style={{
            margin: '-32px -32px 24px',
            borderRadius: '20px 20px 0 0',
            overflow: 'hidden',
            background: '#07111f'
          }}
        >
          <div
            role="img"
            aria-label="Logo GSA HUB - Soluções Digitais"
            style={{ display: 'grid', placeItems: 'center', width: '100%', height: 180, padding: '24px 18px', textAlign: 'center' }}
          >
            <div>
              <div style={{ color: '#f6d77d', fontFamily: 'Georgia, serif', fontSize: 'clamp(32px, 9vw, 52px)', letterSpacing: '0.16em', lineHeight: 1, whiteSpace: 'nowrap' }}>GSA HUB</div>
              <div style={{ width: '78%', height: 1, margin: '16px auto 12px', background: '#c19a43' }} />
              <div style={{ color: '#f6d77d', fontSize: 12, fontWeight: 700, letterSpacing: '0.34em', textTransform: 'uppercase' }}>Soluções Digitais</div>
            </div>
          </div>
        </div>
        {!isClientPortal && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{ color: '#64748b', fontSize: 13 }}>Acesso seguro à plataforma</div>
          </div>
        )}

        <h1 id="login-title" style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 24, textAlign: isClientPortal ? 'center' : 'left' }}>
          {isClientPortal ? 'Área do Cliente' : 'Entrar'}
        </h1>
        <p
          style={{
            margin: isClientPortal ? '0 auto 20px' : '0 0 24px',
            maxWidth: isClientPortal ? 330 : undefined,
            color: '#64748b',
            fontSize: isClientPortal ? 'clamp(10px, 3vw, 12px)' : undefined,
            lineHeight: 1.55,
            textAlign: isClientPortal ? 'center' : 'left'
          }}
        >
          {isClientPortal
            ? <><span style={{ display: 'block', whiteSpace: 'nowrap' }}>Acesse seus serviços, documentos e</span><span style={{ display: 'block', whiteSpace: 'nowrap' }}>atualizações com o código da sua empresa.</span></>
            : 'Use o e-mail cadastrado para acessar seu painel.'}
        </p>

        {isClientPortal && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              marginBottom: 20,
              padding: '12px 14px',
              border: '1px solid #ead9a6',
              borderRadius: 14,
              background: 'linear-gradient(135deg, #fffaf0 0%, #fffdf8 100%)'
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'grid',
                placeItems: 'center',
                flex: '0 0 auto',
                width: 32,
                height: 32,
                borderRadius: 10,
                color: '#9a741a',
                background: '#f8edc9'
              }}
            >
              <ShieldCheck size={17} />
            </span>
            <span style={{ display: 'grid', gap: 2 }}>
              <strong style={{ color: '#4b3b12', fontSize: 12 }}>Acesso protegido</strong>
              <span style={{ color: '#806c38', fontSize: 11 }}>CPF: 6 primeiros dígitos · CNPJ: 5 primeiros</span>
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: isClientPortal ? 16 : 0 }}>
          {isClientPortal ? (
            <>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <label className="form-label" htmlFor="production-login-identifier" style={{ margin: 0 }}>Código de acesso</label>
                  <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>CPF ou CNPJ</span>
                </div>
                <div style={{ position: 'relative' }}>
                  <Hash
                    aria-hidden="true"
                    size={17}
                    style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9a741a' }}
                  />
                  <input
                    id="production-login-identifier"
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{5,6}"
                    minLength={5}
                    maxLength={6}
                    autoComplete="username"
                    placeholder="000000"
                    value={login}
                    onChange={(event) => setLogin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    style={{ height: 48, paddingLeft: 42, borderRadius: 12, letterSpacing: 2, fontWeight: 700 }}
                    required
                  />
                </div>
                <span style={{ color: '#94a3b8', fontSize: 11 }}>Digite somente os números, sem pontos ou traços.</span>
              </div>
            </>
          ) : (
            <>
              <label className="form-label" htmlFor="production-login-email">E-mail</label>
              <input
                id="production-login-email"
                className="form-input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </>
          )}

          {!isClientPortal && (
            <>
              <label className="form-label" htmlFor="production-login-password" style={{ display: 'block', marginTop: 16 }}>
                Senha
              </label>
              <input
                id="production-login-password"
                className="form-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </>
          )}

          {error && (
            <p role="alert" style={{ margin: '0', padding: '10px 12px', borderRadius: 10, color: '#b91c1c', background: '#fff1f2', border: '1px solid #fecdd3', fontSize: 13 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn--primary"
            disabled={submitting}
            style={{
              width: '100%',
              minHeight: 48,
              marginTop: isClientPortal ? 2 : 22,
              justifyContent: 'center',
              borderRadius: 12,
              boxShadow: '0 10px 22px rgba(37, 99, 235, 0.18)'
            }}
          >
            {submitting ? <LockKeyhole size={17} /> : <LogIn size={17} />}
            {submitting ? 'Entrando...' : 'Entrar'}
            {!submitting && isClientPortal && <ArrowRight size={17} />}
          </button>
        </form>
      </section>
    </main>
  );
}
