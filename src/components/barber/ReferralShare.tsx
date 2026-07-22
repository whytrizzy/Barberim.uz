'use client';

import React, { useState } from 'react';
import { Copy, Check, Share2, Instagram, Send } from 'lucide-react';
import { Button } from '../ui/Button';
import { triggerHapticFeedback } from '@/lib/telegramWebApp';

interface ReferralShareProps {
  barberId: string;
  barberName: string;
}

export function ReferralShare({ barberId, barberName }: ReferralShareProps) {
  const [copied, setCopied] = useState(false);
  const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || 'BarberimBot';
  const referralUrl = `https://t.me/${botUsername}?start=barber_${barberId}`;

  const handleCopy = () => {
    triggerHapticFeedback('medium');
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleTelegramShare = () => {
    triggerHapticFeedback('light');
    const shareText = `✂️ Book your haircut slot with ${barberName} directly on Barberim Telegram App!`;
    const tgShareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent(shareText)}`;
    window.open(tgShareUrl, '_blank');
  };

  return (
    <div className="glass-card-gold rounded-2xl p-5 relative overflow-hidden space-y-4">
      {/* Decorative Background Icon */}
      <div className="absolute -right-4 -bottom-4 opacity-10 text-amber-400 pointer-events-none">
        <Share2 className="w-32 h-32" />
      </div>

      <div className="flex items-start justify-between">
        <div>
          <span className="text-[11px] uppercase tracking-wider font-bold text-amber-400">
            Social Booking Link
          </span>
          <h3 className="text-lg font-bold text-white mt-0.5">Share Your Personal Link</h3>
          <p className="text-xs text-slate-300 mt-1 max-w-xs">
            Post this unique Telegram link in your Instagram bio or Telegram channel. Clients can book with 1 click!
          </p>
        </div>
      </div>

      {/* Link Display Box */}
      <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700/80 rounded-xl p-2.5">
        <input
          type="text"
          readOnly
          value={referralUrl}
          className="bg-transparent text-xs text-amber-300 font-mono flex-1 outline-none truncate"
        />
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border border-amber-500/40 shrink-0"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Link</span>
            </>
          )}
        </button>
      </div>

      {/* Action Share Buttons */}
      <div className="grid grid-cols-2 gap-2.5 pt-1">
        <Button variant="secondary" size="sm" onClick={handleTelegramShare} className="gap-2">
          <Send className="w-4 h-4 text-sky-400" />
          Share to Telegram
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCopy}
          className="gap-2 border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
        >
          <Instagram className="w-4 h-4 text-pink-400" />
          Copy for Instagram Bio
        </Button>
      </div>
    </div>
  );
}
