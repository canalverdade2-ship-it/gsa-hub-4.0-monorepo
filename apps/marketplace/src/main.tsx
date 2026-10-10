import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SiteCampaignBootstrap } from './components/campaigns/SiteCampaignBootstrap';
import './lib/clientFacingMessageGuard';
import './index.css';
import './careers.css';
import './gsa-store.css';
import { captureAffiliateReferralFromLocation } from './features/affiliates/attribution';
captureAffiliateReferralFromLocation();

const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Lock "lock:sb-api-auth-token" was not released within 5000ms')) {
    return;
  }
  originalWarn(...args);
};

createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <SiteCampaignBootstrap />
      <App />
    </ErrorBoundary>
);
