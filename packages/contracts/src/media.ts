import { z } from 'zod';

const publicAssetHref = z.string().refine((value) => (
  value.startsWith('/')
  && !value.startsWith('//')
  && !value.includes('..')
  && !value.includes('\\')
), 'media src must be a canonical public asset path');

export const publicMediaSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  kind: z.enum(['book-cover', 'photo', 'diagram', 'screenshot', 'illustration']),
  src: publicAssetHref,
  alt: z.string().trim().min(1),
  caption: z.string().trim().min(1).optional(),
  credit: z.string().trim().min(1),
  verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rightsNote: z.string().trim().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  format: z.enum(['jpg', 'jpeg', 'png', 'webp', 'avif']),
  checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});

export type PublicMedia = z.infer<typeof publicMediaSchema>;
