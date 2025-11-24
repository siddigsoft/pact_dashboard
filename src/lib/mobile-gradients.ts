
export const cyberGradients = {
  primary: 'bg-gradient-to-br from-blue-500 to-blue-700',
  success: 'bg-gradient-to-br from-green-500 to-emerald-700',
  warning: 'bg-gradient-to-br from-orange-500 to-orange-600',
  danger: 'bg-gradient-to-br from-red-500 to-red-600',
  purple: 'bg-gradient-to-br from-purple-500 to-purple-700',
  cyan: 'bg-gradient-to-br from-cyan-400 to-cyan-500',
  header: 'bg-gradient-to-r from-blue-600 to-purple-600',
  nav: 'bg-gradient-to-r from-slate-900/95 via-slate-800/95 to-slate-900/95 dark:from-slate-950/95 dark:via-slate-900/95 dark:to-slate-950/95',
  card: 'bg-gradient-to-br from-blue-500/10 to-purple-500/10',
  glass: 'backdrop-blur-lg bg-white/10 dark:bg-black/10 border border-white/20',
  glow: 'shadow-[0_0_20px_rgba(59,130,246,0.3)]',
} as const;

export const cyberBorders = {
  primary: 'border-blue-400/30',
  success: 'border-green-400/30',
  warning: 'border-orange-400/30',
  danger: 'border-red-400/30',
  purple: 'border-purple-400/30',
  cyan: 'border-cyan-400/30',
  glow: 'border-blue-500/20',
} as const;

export const cyberText = {
  glow: 'drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]',
  primary: 'text-blue-400',
  success: 'text-green-400',
  warning: 'text-orange-400',
  danger: 'text-red-400',
  purple: 'text-purple-400',
  cyan: 'text-cyan-400',
} as const;

export function getCyberCardClasses(variant: 'primary' | 'success' | 'warning' | 'danger' | 'purple' = 'primary') {
  return `${cyberGradients[variant]} text-white border-0 shadow-lg`;
}

export function getCyberGlassClasses(borderVariant: keyof typeof cyberBorders = 'glow') {
  return `${cyberGradients.glass} ${cyberBorders[borderVariant]}`;
}
