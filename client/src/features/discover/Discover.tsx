import {
  ArrowLeft, Atom, BookOpen, BookOpenText, ChevronDown, ChevronRight,
  CodeXml, GraduationCap, LibraryBig, MessageSquare, Monitor, MousePointer2,
  PlaySquare, Ruler, Sparkles, TriangleRight, Video,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { ContinueLearning } from '../engagement/ContinueLearning';
import { DailyLearning } from '../discovery/Cards';
import './strings';
import './discover.css';

const subjects = ['math', 'science', 'languages', 'digital'] as const;
type Subject = typeof subjects[number];

function SubjectArtwork({ subject }: { subject: Subject }) {
  return (
    <div className={`subject-art subject-art--${subject}`} aria-hidden="true">
      <div className="subject-art__composition" dir="ltr">
        {subject === 'math' && <>
          <span className="subject-art__sheet" />
          <TriangleRight className="subject-art__triangle" />
          <Ruler className="subject-art__ruler" />
          <span className="subject-art__circle" />
        </>}
        {subject === 'science' && <>
          <span className="subject-art__orbit" />
          <Atom className="subject-art__atom" />
          <span className="subject-art__planet" />
          <span className="subject-art__moon" />
        </>}
        {subject === 'languages' && <>
          <span className="subject-art__page" />
          <span className="subject-art__bubble subject-art__bubble--back">
            <MessageSquare /><span>ا</span>
          </span>
          <span className="subject-art__bubble subject-art__bubble--front">
            <MessageSquare /><span>A</span>
          </span>
        </>}
        {subject === 'digital' && <>
          <span className="subject-art__circuit" />
          <Monitor className="subject-art__screen" />
          <CodeXml className="subject-art__code" />
          <MousePointer2 className="subject-art__cursor" />
        </>}
      </div>
    </div>
  );
}

function SubjectGrid({ heading: Heading = 'h3' }: { heading?: 'h2' | 'h3' }) {
  const { t } = useTranslation('discover');
  return (
    <div className="discover-subject-grid">
      {subjects.map(subject => (
        <Link className="discover-subject-card" to={`/explore?subject=${subject}`} key={subject}>
          <SubjectArtwork subject={subject} />
          <div className="discover-subject-copy">
            <Heading>{t(subject)}</Heading>
            <p>{t(`${subject}Hint`)}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

const formats = [
  { id: 'courses', to: '/courses', Icon: BookOpenText },
  { id: 'videos', to: '/videos', Icon: Video },
  { id: 'shorts', to: '/shorts', Icon: PlaySquare },
  { id: 'ai', to: '/ai-learning', Icon: Sparkles },
  { id: 'library', to: '/library', Icon: LibraryBig },
] as const;

export function HomePage() {
  const { t } = useTranslation('discover');
  return (
    <div className="discover-page">
      <header className="discover-hero">
        <div className="discover-hero__copy">
          <h1>{t('heroTitle')}{' '}<span>{t('heroTitleEnd')}</span></h1>
          <p>{t('mission')}</p>
          <Link to="/explore" className="discover-start"><BookOpen size={18} aria-hidden="true" />{t('start')}</Link>
        </div>
        <div className="discover-hero__art" aria-hidden="true">
          <img src="/art/study.webp" alt="" fetchPriority="high" decoding="async" />
        </div>
      </header>

      <ContinueLearning />
      <DailyLearning compact />
      <section className="discover-section" aria-labelledby="home-subjects-heading">
        <div className="discover-section__heading">
          <div><h2 id="home-subjects-heading">{t('browse')}</h2><p>{t('browseHint')}</p></div>
        </div>
        <SubjectGrid />
      </section>

      <section className="discover-section" aria-labelledby="home-formats-heading">
        <div className="discover-section__heading">
          <div><h2 id="home-formats-heading">{t('formats')}</h2></div>
        </div>
        <div className="discover-formats">
          {formats.map(({ id, to, Icon }) => (
            <Link to={to} className={`discover-format discover-format--${id}`} key={id}>
              <span className="discover-format__mark"><Icon size={23} strokeWidth={1.6} aria-hidden="true" /></span>
              <span><strong>{t(id)}</strong><span>{t(`${id}Hint`)}</span></span>
              <ChevronRight className="discover-direction" size={17} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ExplorePage() {
  const { t } = useTranslation('discover');
  const [params] = useSearchParams();
  const subject = subjects.find(value => value === params.get('subject'));

  if (!subject) {
    return (
      <div className="discover-page discover-explore">
        <header className="discover-explore__intro">
          <h1>{t('explore')}</h1>
          <p>{t('exploreHint')}</p>
        </header>
        <SubjectGrid heading="h2" />
      </div>
    );
  }

  const topics = t(`${subject}Topics`, { returnObjects: true }) as [string, string][];
  return (
    <div className="discover-page discover-explore">
      <Link to="/explore" className="discover-back"><ArrowLeft size={17} aria-hidden="true" />{t('chooseAnother')}</Link>
      <header className="discover-detail">
        <div>
          <span className="discover-detail__preview"><GraduationCap size={17} aria-hidden="true" />{t('outline')}</span>
          <h1>{t(subject)}</h1>
          <p>{t('outlineHint')}</p>
        </div>
        <SubjectArtwork subject={subject} />
      </header>
      <div className="discover-outline" key={subject}>
        {topics.map(([title, description]) => (
          <details key={title} className="discover-topic">
            <summary>{title}<ChevronDown size={18} aria-hidden="true" /></summary>
            <p>{description}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
