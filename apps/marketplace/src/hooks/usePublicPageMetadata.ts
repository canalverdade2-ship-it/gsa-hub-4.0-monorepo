import { useEffect } from 'react';
import type { PublicPage, ServicePackage } from '../data/publicServiceCatalog';

const DEFAULT_TITLE = 'GSA HUB I Soluções Digitais';
const DEFAULT_DESCRIPTION = 'Tecnologia, serviços, saúde, seguros e comércio conectados em um ecossistema criado para pessoas e empresas avançarem.';

function ensureMeta(selector: string, attribute: 'name' | 'property', key: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  return element;
}

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  ensureMeta(`meta[${attribute}="${key}"]`, attribute, key).setAttribute('content', content);
}

function setCanonical(url: string) {
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = url;
}

export function usePublicPageMetadata(page: PublicPage, selectedPackage: ServicePackage | null, loginOnly = false) {
  useEffect(() => {
    const title = loginOnly
      ? 'Acesso ao Portal | GSA HUB'
      : selectedPackage
        ? `${selectedPackage.title} | GSA HUB`
        : page === 'services'
          ? 'Serviços e Assinaturas | GSA HUB'
          : page === 'free-tools'
            ? 'Calculadoras e Serviços Gratuitos | GSA HUB'
          : page === 'systems'
            ? 'Criação de Sites e Sistemas | GSA HUB'
            : page === 'partners'
              ? 'Nossos Parceiros | GSA HUB'
                  : DEFAULT_TITLE;

    const description = loginOnly
      ? 'Acesse a área do cliente, prestador ou equipe do GSA HUB.'
      : selectedPackage?.description
        || (page === 'services'
          ? 'Pacotes administrativos, financeiros, veiculares, previdenciários e empresariais do GSA HUB.'
          : page === 'free-tools'
            ? 'Calculadoras trabalhistas e previdenciárias gratuitas para simular rescisão, aposentadoria pelo INSS e férias.'
          : page === 'systems'
            ? 'Criação de sites, lojas virtuais, aplicativos, sistemas web, integrações e automações sob medida.'
            : page === 'partners'
              ? 'Conheça empresas e profissionais que fazem parte da rede de parceiros da GSA HUB.'
                  : DEFAULT_DESCRIPTION);

    const canonicalPath = loginOnly
      ? '/login'
      : selectedPackage
        ? window.location.pathname
        : page === 'services'
          ? '/servicos-e-assinaturas'
          : page === 'free-tools'
            ? '/servicos-gratuitos'
          : page === 'systems'
            ? '/criacao-de-site-e-sistemas'
            : page === 'partners'
              ? window.location.pathname.startsWith('/nossos-parceiros/') || window.location.pathname.startsWith('/parceiros/')
                ? window.location.pathname
                : '/nossos-parceiros'
                  : '/';
    const canonical = new URL(canonicalPath, window.location.origin).toString();
    const image = new URL(page === 'free-tools' ? '/og-servicos-gratuitos.png' : '/logo.svg', window.location.origin).toString();

    document.title = title;
    setCanonical(canonical);
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', selectedPackage ? 'product' : 'website');
    setMeta('property', 'og:image', image);
    setMeta('property', 'og:url', canonical);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', image);

    const scriptId = 'gsa-public-structured-data';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }

    script.text = JSON.stringify(selectedPackage && !loginOnly ? {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: selectedPackage.title,
      description: selectedPackage.description,
      provider: { '@type': 'Organization', name: 'GSA HUB' },
      url: canonical,
    } : page === 'systems' && !loginOnly ? {
      '@context': 'https://schema.org',
      '@type': 'ProfessionalService',
      name: 'GSA Soluções Digitais',
      description,
      url: canonical,
      email: 'gsa.doc.adm@gmail.com',
      telephone: '+55 11 92085-7756',
      areaServed: 'BR',
      serviceType: ['Criação de sites', 'Desenvolvimento de sistemas', 'Aplicativos', 'Lojas virtuais', 'Automações e integrações'],
    } : {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'GSA HUB',
      description,
      url: canonical,
    });
  }, [loginOnly, page, selectedPackage]);
}
