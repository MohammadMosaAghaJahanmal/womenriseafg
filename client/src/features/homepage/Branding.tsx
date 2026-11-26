import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { BookOpenText } from 'lucide-react';
import { fileUrl } from '../courses/student/api';
import { loadBranding, type Branding } from './api';
import './branding.css';

const defaultFavicon = '/favicon.svg';
const defaultBranding: Branding = { name: 'womenriseafg', logoId: null, faviconId: null, translations: [] };
const BrandingContext = createContext<{ branding: Branding; refresh: () => void }>({
  branding: defaultBranding, refresh: () => undefined,
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState(defaultBranding);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    void loadBranding(controller.signal).then(value => {
      if (!controller.signal.aborted) setBranding(value);
    }, () => undefined);
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!icon) return;
    icon.href = branding.faviconId ? fileUrl(branding.faviconId) : defaultFavicon;
    if (branding.faviconId) icon.removeAttribute('type');
    else icon.type = 'image/svg+xml';
  }, [branding.faviconId]);
  return <BrandingContext.Provider value={{ branding, refresh }}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}

export function BrandLogo({ id }: { id: string | null }) {
  return id ? <img src={fileUrl(id)} className="site-brand-image" alt="" width="38" height="38" decoding="async" />
    : <BookOpenText size={23} strokeWidth={1.8} aria-hidden="true" />;
}

export function brandCopy(branding: Branding, locale: string, field: 'slogan' | 'mission') {
  return branding.translations.find(copy => copy.locale === locale)?.[field]?.trim() ?? '';
}
