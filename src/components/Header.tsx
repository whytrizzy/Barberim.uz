'use client';

import React from 'react';
import { Role } from '@/types';
import { Scissors, ShieldCheck, UserCheck } from 'lucide-react';
import { Badge } from './ui/Badge';

interface HeaderProps {
  currentRole: Role;
  onRoleToggle: (role: Role) => void;
}

export function Header({ currentRole, onRoleToggle }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 w-full glass-card border-b border-slate-800/80 px-4 py-3">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-600 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-amber-500/20">
            <Scissors className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-white flex items-center gap-1.5">
              Barberim<span className="text-amber-400 font-medium text-xs bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">.uz</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">Smart Barber Scheduling</p>
          </div>
        </div>

        {/* Role Switcher Pill */}
        <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => onRoleToggle('BARBER')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              currentRole === 'BARBER'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Barber
          </button>
          <button
            onClick={() => onRoleToggle('CLIENT')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              currentRole === 'CLIENT'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Client
          </button>
        </div>
      </div>
    </header>
  );
}
