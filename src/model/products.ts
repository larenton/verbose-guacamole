import type { ProductCode } from './types';

export interface ProductMeta {
  code: ProductCode;
  name: string;
  colour: string;
  isProduct: boolean;
  /** Intake month label, if any (resolved to a month id at import time). */
  intakeLabel?: string;
  order: number;
}

// Order follows the traffic sheet. Colour is semantic product identity only.
export const PRODUCT_META: Record<ProductCode, ProductMeta> = {
  H1: {
    code: 'H1',
    name: 'Applied Degrees (Business & IT) - H1 run-off',
    colour: '#64748b', // slate
    isProduct: true,
    order: 0,
  },
  ES: {
    code: 'ES',
    name: 'Engineering Technology (Energy Systems)',
    colour: '#0d9488', // teal
    isProduct: true,
    intakeLabel: 'Jan-28',
    order: 1,
  },
  CD: {
    code: 'CD',
    name: 'Diploma in Cyber Defence',
    colour: '#4f46e5', // indigo
    isProduct: true,
    intakeLabel: 'Jan-28',
    order: 2,
  },
  HM: {
    code: 'HM',
    name: 'Diploma in Health Management',
    colour: '#16a34a', // green
    isProduct: true,
    intakeLabel: 'Jul-28',
    order: 3,
  },
  ID: {
    code: 'ID',
    name: 'Industry Diplomas & Prof Certificates',
    colour: '#d97706', // amber
    isProduct: true,
    intakeLabel: 'Jul-28',
    order: 4,
  },
  DM: {
    code: 'DM',
    name: 'Bachelor/Assoc Degree Digital Media',
    colour: '#9333ea', // violet
    isProduct: true,
    intakeLabel: 'Oct-28',
    order: 5,
  },
  PF: {
    code: 'PF',
    name: 'Portfolio / Playbook / BAU support',
    colour: '#94a3b8', // muted slate — portfolio, not a product
    isProduct: false,
    order: 6,
  },
  XX: {
    code: 'XX',
    name: 'Admin / L&T / General',
    colour: '#cbd5e1', // near-blank — admin, not a product
    isProduct: false,
    order: 7,
  },
};

export const PRODUCT_CODES: ProductCode[] = [
  'H1',
  'ES',
  'CD',
  'HM',
  'ID',
  'DM',
  'PF',
  'XX',
];

/** The six real products (excludes PF and XX). */
export const REAL_PRODUCT_CODES: ProductCode[] = ['H1', 'ES', 'CD', 'HM', 'ID', 'DM'];
