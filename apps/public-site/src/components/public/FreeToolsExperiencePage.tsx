import { FreeToolsPage } from './FreeToolsPage';

interface FreeToolsExperiencePageProps {
  onBack: () => void;
  onServices: () => void;
  onClientLogin: () => void;
}

const RESPONSIVE_STYLES = `
  .gsa-free-tools-institutional {
    overflow-x: clip;
  }

  .gsa-free-tools-institutional button {
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  @media (max-width: 767px) {
    .gsa-free-tools-institutional main > section:nth-of-type(2) button.group,
    .gsa-free-tools-institutional main > section:nth-of-type(2) article {
      min-height: 0 !important;
    }

    .gsa-free-tools-institutional main h1 {
      font-size: clamp(2.3rem, 10vw, 3rem) !important;
      line-height: 1.04 !important;
    }

    .gsa-free-tools-institutional main h2 {
      overflow-wrap: anywhere;
    }
  }
`;

export function FreeToolsExperiencePage(props: FreeToolsExperiencePageProps) {
  return (
    <div className="gsa-free-tools-institutional">
      <style>{RESPONSIVE_STYLES}</style>
      <FreeToolsPage {...props} />
    </div>
  );
}
