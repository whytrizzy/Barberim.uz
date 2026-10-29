import React from 'react';
import { clsx } from 'clsx';

interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'gold';
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'info', children, className }: BadgeProps) {
  const styles = {
    success: 'bg-ok/15 text-ok',
    warning: 'bg-gold/15 text-gold',
    danger: 'bg-danger/15 text-danger',
    info: 'bg-blue/15 text-blue',
    gold: 'bg-gold/15 text-gold',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wide',
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
