import Joi from 'joi';

export const contentOrigins = ['human', 'ai-assisted', 'ai-generated'] as const;
export interface ContentProvenance {
  source: string;
  creator: string;
  license: string;
  attribution: string;
  origin: typeof contentOrigins[number];
  tool: string;
  notes: string;
}

const text = (length: number) => Joi.string().trim().max(length).allow('').default('');
export const provenanceInput = Joi.object({
  source: text(500),
  creator: text(150),
  license: text(150),
  attribution: text(500),
  origin: Joi.string().valid(...contentOrigins).default('human'),
  tool: text(150),
  notes: text(1200),
}).allow(null).default(null);

export const emptyProvenance: ContentProvenance = {
  source: '', creator: '', license: '', attribution: '', origin: 'human', tool: '', notes: '',
};

export function completeProvenance(record: ContentProvenance | null | undefined) {
  return !!record && !!record.source.trim() && !!record.creator.trim() && !!record.license.trim()
    && (record.origin === 'human' || (!!record.tool.trim() && !!record.notes.trim()));
}

export function publicProvenance(record: ContentProvenance | null | undefined) {
  if (!record) return null;
  const { source, creator, license, attribution, origin, tool } = record;
  return { source, creator, license, attribution, origin, tool: origin === 'human' ? '' : tool };
}
