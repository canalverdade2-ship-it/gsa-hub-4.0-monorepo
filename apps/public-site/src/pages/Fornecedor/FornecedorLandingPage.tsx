import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  FileCheck2,
  LockKeyhole,
  PackageSearch,
  ReceiptText,
  ShieldCheck,
  Truck,
  WalletCards,
} from 'lucide-react';
import { LogoGSA } from '../../components/ui/LogoGSA';

interface FornecedorLandingPageProps {
  onAccessLogin: () => void;
  onBackToSite: () => void;
}

const FLOW = [
  {
    title: 'Credenciamento e análise',
    description: 'Os dados cadastrais e comerciais são enviados para conferência antes da liberação do acesso.',
  },
  {
    title: 'Homologação de produtos',
    description: 'O fornecedor informa condições, custos, prazos e disponibilidade para avaliação da equipe GSA.',
  },
  {
    title: 'Pedidos e entregas',
    description: 'Cada pedido de compra possui itens, quantidades, previsão e acompanhamento operacional próprio.',
  },
  {
    title: 'Conferência e pagamento',
    description: 'Notas fiscais, entregas e valores permanecem vinculados até a conclusão do processo financeiro.',
  },
];

const OPERATIONS = [
  {
    icon: PackageSearch,
    title: 'Produtos e condições comerciais',
    description: 'Solicite a inclusão de produtos, acompanhe análises e responda ajustes sem perder o histórico da negociação.',
  },
  {
    icon: Truck,
    title: 'Pedidos, saldos e entregas',
    description: 'Visualize o que foi solicitado, o saldo ainda pendente e os dados necessários para informar cada entrega.',
  },
  {
    icon: ReceiptText,
    title: 'Notas fiscais e documentos',
    description: 'Envie XML ou PDF da nota fiscal no próprio pedido, com registro de data, valor e itens entregues.',
  },
  {
    icon: WalletCards,
    title: 'Financeiro e recebimentos',
    description: 'Consulte valores previstos, pendências, pagamentos concluídos e os dados bancários cadastrados.',
  },
];

const STANDARDS = [
  {
    number: '01',
    title: 'Informação verificável',
    description: 'Produtos, documentos, quantidades, custos e dados bancários precisam permanecer atualizados e consistentes.',
  },
  {
    number: '02',
    title: 'Rastreabilidade operacional',
    description: 'Pedidos, entregas, análises e pagamentos são tratados dentro do portal para preservar o histórico da operação.',
  },
  {
    number: '03',
    title: 'Relacionamento responsável',
    description: 'A parceria depende do cumprimento dos prazos, da qualidade acordada e da regularidade dos documentos enviados.',
  },
];

export function FornecedorLandingPage({ onAccessLogin, onBackToSite }: FornecedorLandingPageProps) {
  return (
    <div className="supplier-public">
      <header className="supplier-public__topbar">
        <div className="supplier-public__topbar-inner">
          <div className="supplier-public__brand">
            <LogoGSA size="sm" variant="dark" />
            <span className="supplier-public__brand-divider" aria-hidden="true" />
            <div className="supplier-public__brand-copy">
              <strong>Portal do Fornecedor</strong>
              <span>Central de suprimentos GSA</span>
            </div>
          </div>

          <div className="supplier-public__actions">
            <button type="button" onClick={onBackToSite} className="supplier-public__back">
              <ArrowLeft size={17} />
              <span>Voltar ao site</span>
            </button>
            <button type="button" onClick={onAccessLogin} className="supplier-public__access">
              <LockKeyhole size={16} />
              Acessar portal
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="supplier-public__hero" aria-labelledby="supplier-title">
          <div className="supplier-public__hero-inner">
            <div>
              <p className="supplier-public__eyebrow">Relacionamento comercial GSA HUB</p>
              <h1 id="supplier-title" className="supplier-public__title">
                Uma operação clara entre a GSA e seus
                <span>fornecedores.</span>
              </h1>
              <p className="supplier-public__lead">
                O portal concentra credenciamento, produtos, pedidos de compra, entregas, notas fiscais e pagamentos em uma jornada única, organizada e rastreável.
              </p>

              <div className="supplier-public__cta-row">
                <button type="button" onClick={onAccessLogin} className="supplier-public__primary">
                  Entrar ou solicitar cadastro
                  <ArrowRight size={17} />
                </button>
                <a href="#operacao" className="supplier-public__secondary">
                  Conhecer a operação
                </a>
              </div>

              <div className="supplier-public__assurance" aria-label="Compromissos do portal">
                <div className="supplier-public__assurance-item">
                  <strong>Cadastro analisado</strong>
                  <span>Acesso liberado somente após conferência da equipe GSA.</span>
                </div>
                <div className="supplier-public__assurance-item">
                  <strong>Pedidos formalizados</strong>
                  <span>Itens, quantidades e previsões vinculados à operação.</span>
                </div>
                <div className="supplier-public__assurance-item">
                  <strong>Pagamentos rastreáveis</strong>
                  <span>Valores e comprovantes associados às entregas aprovadas.</span>
                </div>
              </div>
            </div>

            <aside className="supplier-public__workflow" aria-label="Fluxo comercial do fornecedor">
              <h2>Da análise ao recebimento</h2>
              <p>Cada etapa possui registro próprio e depende da conclusão da etapa anterior.</p>
              {FLOW.map((item, index) => (
                <div className="supplier-public__step" key={item.title}>
                  <span className="supplier-public__step-number">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                </div>
              ))}
            </aside>
          </div>
        </section>

        <section id="operacao" className="supplier-public__operations" aria-labelledby="operation-title">
          <div className="supplier-public__section-heading">
            <div>
              <p className="supplier-public__section-kicker">Central operacional</p>
              <h2 id="operation-title">Tudo o que sustenta a relação de fornecimento.</h2>
            </div>
            <p>
              O portal foi estruturado para reduzir conversas dispersas, documentos sem vínculo e dúvidas sobre o andamento de cada pedido. O fornecedor acompanha o processo no mesmo ambiente em que executa suas ações.
            </p>
          </div>

          <div className="supplier-public__operation-list">
            {OPERATIONS.map(({ icon: Icon, title, description }) => (
              <article className="supplier-public__operation" key={title}>
                <Icon size={24} strokeWidth={1.7} />
                <strong>{title}</strong>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="supplier-public__standards-wrap" aria-labelledby="standards-title">
          <div className="supplier-public__standards">
            <div className="supplier-public__section-heading">
              <div>
                <p className="supplier-public__section-kicker">Padrão de relacionamento</p>
                <h2 id="standards-title">Parcerias comerciais exigem precisão.</h2>
              </div>
              <p>
                A GSA trabalha com informações conferidas, histórico preservado e responsabilidades claras. O portal apoia essa relação desde o primeiro cadastro até o pagamento final.
              </p>
            </div>

            <div className="supplier-public__standard-grid">
              {STANDARDS.map((item) => (
                <article className="supplier-public__standard" key={item.number}>
                  <span>{item.number}</span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>

            <div className="supplier-public__closing">
              <p>
                Fornecedores já homologados podem acessar o painel com CPF ou CNPJ e o PIN liberado pela GSA. Novos interessados podem iniciar o credenciamento na mesma área de acesso.
              </p>
              <button type="button" onClick={onAccessLogin} className="supplier-public__primary">
                <BadgeCheck size={17} />
                Iniciar acesso
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="supplier-public__footer">
        <div className="supplier-public__footer-inner">
          <div className="supplier-public__brand">
            <Building2 size={16} />
            <strong>GSA HUB · Central de Suprimentos</strong>
          </div>
          <div className="supplier-public__brand">
            <ShieldCheck size={16} />
            <span>Ambiente institucional para fornecedores credenciados</span>
          </div>
          <span>© {new Date().getFullYear()} Grupo GSA</span>
        </div>
      </footer>
    </div>
  );
}
