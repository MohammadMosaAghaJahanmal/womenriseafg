import { useTranslation } from 'react-i18next';
import { Pagination } from '../../../components/ui/Primitives';
import { bookAdminNamespace } from './strings';

export function BookPager({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  const { t, i18n } = useTranslation(bookAdminNamespace);
  const number = new Intl.NumberFormat(i18n.language);
  return <Pagination page={page} pages={pages} onChange={onChange}
    label={t('pages')} previous={t('previous')} next={t('next')}
    pageLabel={t('page', { page: number.format(page), pages: number.format(pages) })} />;
}
