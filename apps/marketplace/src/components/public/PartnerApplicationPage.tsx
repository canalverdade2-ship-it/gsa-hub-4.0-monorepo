import { useEffect } from 'react';
import { ArrowLeft, Check, Clock3, FileCheck2, ShieldCheck } from 'lucide-react';
import { LogoGSA } from '../ui/LogoGSA';
import { HomeLogoLink } from '../ui/HomeLogoLink';
import { PartnerApplicationForm } from './PartnerApplicationModal';
import '../../partners.css';

interface PartnerApplicationPageProps {
  onBack: () => void;
}

export function PartnerApplicationPage({ onBack }: PartnerApplicationPageProps) {
  useEffect(() => {
    document.body.classList.add('gsa-public-partners', 'gsa-partner-application-page');
    window.scrollTo({ top: 0, behavior: 'auto' });
    return () => document.body.classList.remove('gsa-public-partners', 'gsa-partner-application-page');
  }, []);

  return (
    <main className="partners-page partner-application-page">
      <header className="partner-application-page__topbar">
        <div className="partners-container partner-application-page__topbar-inner">
          <button type="button" onClick={onBack} className="partner-application-page__back">
            <ArrowLeft aria-hidden="true" />
            Voltar ao diretório
          </button>
          <HomeLogoLink><LogoGSA size="sm" variant="dark" showText /></HomeLogoLink>
          <span className="partner-application-page__area">Parcerias institucionais</span>
        </div>
      </header>

      <section className="partner-application-page__hero">
        <div className="partners-container partner-application-page__hero-layout">
          <div>
            <p className="partners-kicker">Solicitação de parceria</p>
            <h1>Apresente sua empresa para avaliação da Rede GSA.</h1>
          </div>
          <p>
            Este é o canal oficial para empresas, profissionais e organizações interessadas em integrar o diretório público de parceiros. O envio gera protocolo e segue para análise administrativa.
          </p>
        </div>
      </section>

      <section className="partner-application-page__content">
        <div className="partners-container partner-application-page__layout">
          <aside className="partner-application-page__guide" aria-label="Informações sobre a solicitação">
            <div className="partner-application-page__guide-heading">
              <span>Antes de começar</span>
              <strong>Prepare as informações da empresa</strong>
            </div>

            <div className="partner-application-page__guide-list">
              <div><ShieldCheck aria-hidden="true" /><p><strong>Análise administrativa</strong><span>O envio não representa aprovação ou publicação automática.</span></p></div>
              <div><Clock3 aria-hidden="true" /><p><strong>8 a 12 minutos</strong><span>Tempo médio para concluir as quatro etapas.</span></p></div>
              <div><FileCheck2 aria-hidden="true" /><p><strong>Protocolo oficial</strong><span>O número é gerado somente após o registro ser confirmado.</span></p></div>
            </div>

            <div className="partner-application-page__documents">
              <strong>Tenha em mãos</strong>
              <ul>
                <li><Check aria-hidden="true" />CPF ou CNPJ</li>
                <li><Check aria-hidden="true" />Contatos e endereço</li>
                <li><Check aria-hidden="true" />Serviços e regiões atendidas</li>
                <li><Check aria-hidden="true" />Logotipo e foto de capa, se disponíveis</li>
              </ul>
            </div>
          </aside>

          <div className="partner-application-page__form-panel">
            <PartnerApplicationForm onCancel={onBack} />
          </div>
        </div>
      </section>
    </main>
  );
}
