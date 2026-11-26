import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useDataSaving } from '../data-saving/preferences';
import { brandCopy } from './Branding';
import type { Branding } from './api';
import { homepageNamespace as ns } from './strings';
import '../discover/discover.css';

export function HomeHero({ branding }: { branding: Branding }) {
  const { t, i18n } = useTranslation(ns);
  const { enabled: saving } = useDataSaving();
  const slogan = brandCopy(branding, i18n.language, 'slogan');
  const showDefault = !slogan || slogan === t('heroTitle') + ' ' + t('heroAccent');
  return <header className="discover-hero">
    <div className="discover-hero__copy">
      <h1>{showDefault ? <>{t('heroTitle')}{' '}<span>{t('heroAccent')}</span></> : slogan}</h1>
      <p>{t('heroDescription')}</p>
      <Link to="/courses" className="discover-start"><BookOpen size={18} aria-hidden="true" />{t('start')}</Link>
    </div>
    {!saving && <div className="discover-hero__art" aria-hidden="true">
      <img src="/art/study.webp" srcSet="/art/study-480.webp 480w, /art/study.webp 1000w"
        sizes="(max-width: 650px) 240px, (max-width: 959px) 49vw, (max-width: 1490px) 40vw, 620px"
        width="1000" height="667" alt="" fetchPriority="high" decoding="async" />
    </div>}
  </header>;
}
