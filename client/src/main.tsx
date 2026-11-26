import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n';
import './styles.css';
import { PreferencesProvider } from './preferences';
import { BrandingProvider } from './features/homepage/Branding';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider><BrandingProvider><BrowserRouter><App /></BrowserRouter></BrandingProvider></PreferencesProvider>
  </StrictMode>,
);
