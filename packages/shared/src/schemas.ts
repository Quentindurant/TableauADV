import { z } from 'zod';

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hexadécimale attendue (ex. #AABBCC)');

const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mois attendu au format YYYY-MM (ex. 2026-08)');

export const columnTypeSchema = z.enum([
  'TEXT',
  'LONGTEXT',
  'DATE',
  'TIME',
  'NUMBER',
  'SELECT',
  'LINK',
]);

export const loginSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export const createUserSchema = z.object({
  email: z.string().trim().email('Adresse e-mail invalide'),
  displayName: z.string().trim().min(1, 'Nom affiché requis'),
  password: z.string().min(8, 'Mot de passe : 8 caractères minimum'),
  cursorColor: hexColor,
});

export const updateMeSchema = z
  .object({
    displayName: z.string().trim().min(1, 'Nom affiché requis').optional(),
    cursorColor: hexColor.optional(),
    password: z.string().min(8, 'Mot de passe : 8 caractères minimum').optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: 'Aucun champ à modifier',
  });

export const createColumnSchema = z.object({
  label: z.string().trim().min(1, 'Libellé requis'),
  type: columnTypeSchema,
});

export const updateColumnSchema = z.object({
  label: z.string().trim().min(1, 'Libellé requis').optional(),
  type: columnTypeSchema.optional(),
  position: z.number().int('Position entière attendue').min(0).optional(),
  width: z.number().int('Largeur entière attendue').min(40).max(1000).optional(),
  visible: z.boolean().optional(),
});

export const createChoiceSchema = z.object({
  label: z.string().trim().min(1, 'Libellé requis'),
  bgColor: hexColor.optional(),
  textColor: hexColor.optional(),
  bold: z.boolean().optional(),
});

export const updateChoiceSchema = z.object({
  label: z.string().trim().min(1, 'Libellé requis').optional(),
  bgColor: hexColor.nullable().optional(),
  textColor: hexColor.nullable().optional(),
  bold: z.boolean().optional(),
  position: z.number().int('Position entière attendue').min(0).optional(),
  archived: z.boolean().optional(),
});

export const createRowSchema = z.object({
  month,
  position: z.number().int('Position entière attendue').min(0).optional(),
});

// Définition EXACTE du contrat (_contracts.md) — ne pas modifier.
export const patchRowSchema = z.object({
  expectedVersion: z.number().int(),
  patch: z.record(z.union([z.string(), z.number(), z.null()])).optional(),
  formats: z
    .record(z.object({ bg: z.string().optional() }).nullable())
    .optional(),
});

export const moveRowSchema = z.object({
  month: month.optional(),
  position: z.number().int('Position entière attendue').min(0).optional(),
});
