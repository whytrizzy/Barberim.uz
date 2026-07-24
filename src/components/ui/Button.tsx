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
    try {
      triggerHapticFeedback('light');
    } catch {
      /* haptics unsupported on some clients */
    }
    if (onClick) onClick(e);
  };

  const variants = {
    primary:
      'bg-gradient-to-br from-gold to-gold-600 text-gold-ink font-extrabold gold-glow active:scale-[0.98]',
    secondary:
      'bg-surface-2 text-[--text] border border-line hover:border-[#323c4b] active:scale-[0.98]',
    danger:
      'bg-surface-2 text-danger border border-danger/30 hover:bg-danger/10 font-bold active:scale-[0.98]',
    outline:
      'border-2 border-gold/70 text-gold hover:bg-gold/10 active:scale-[0.98]',
    ghost: 'text-muted hover:text-[--text] hover:bg-surface-2',
  };

  const sizes = {
    sm: 'px-3 py-2 text-xs rounded-xl',
    md: 'px-4 py-3 text-sm rounded-2xl',
    lg: 'px-6 py-3.5 text-[15px] rounded-2xl',
  };

  return (
    <button
      onClick={handleClick}
      className={clsx(
        'inline-flex items-center justify-center font-bold transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none',
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
