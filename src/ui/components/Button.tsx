import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'default' | 'primary' | 'danger' | 'ghost';

const VARIANT: Record<Variant, string> = {
  default:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100',
  primary:
    'border border-slate-800 bg-slate-800 text-white hover:bg-slate-700 active:bg-slate-900',
  danger: 'border border-red-600 bg-red-600 text-white hover:bg-red-500 active:bg-red-700',
  ghost: 'border border-transparent text-slate-600 hover:bg-slate-100',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = 'default', className = '', children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
