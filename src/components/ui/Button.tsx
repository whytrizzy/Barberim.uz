'use client';

import React from 'react';
import { clsx } from 'clsx';
import { triggerHapticFeedback } from '@/lib/telegramWebApp';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  onClick,
  children,
  ...props
}: ButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Haptic feedback is unsupported on some Telegram clients (e.g. Desktop) and
    // can THROW — it must never block the button's real onClick handler.
    try {
      triggerHapticFeedback('light');
    } catch {
      /* ignore unsupported haptics */
    }
    if (onClick) onClick(e);
  };

  const variants = {
    primary:
      'bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-slate-950 font-bold shadow-lg shadow-amber-500/20 active:scale-[0.98]',
    secondary:
      'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 active:scale-[0.98]',
    danger:
      'bg-red-600/90 hover:bg-red-600 text-white font-medium shadow-lg shadow-red-600/20 active:scale-[0.98]',
    outline:
      'border-2 border-amber-500/80 text-amber-400 hover:bg-amber-500/10 active:scale-[0.98]',
    ghost: 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg',
    md: 'px-4 py-2.5 text-sm rounded-xl',
    lg: 'px-6 py-3.5 text-base rounded-2xl font-semibold',
  };

  return (
    <button
      onClick={handleClick}
      className={clsx(
        'inline-flex items-center justify-center transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
