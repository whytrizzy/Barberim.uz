import 'server-only';
import type { CSSProperties } from 'react';
import type { Messages } from '@/i18n/messages';
import { SANS, SIGN } from './fonts';

// The sharing kit's two pictures, drawn by next/og (Satori): only inline styles and flexbox, and
// every element with more than one child is a flex box. Colours are the light Sartaroshxona tokens
// from DESIGN.md: a print and an Instagram story are always light.

const C = {
  tile: '#d9e8e1',
  porcelain: '#fbfdfc',
  chrome: '#a9b7b2',
  ink: '#0f332b',
  inkMuted: '#4b6a62',
  enamel: '#ae1730',
  onEnamel: '#ffffff',
};

export type ShareCardData = {
  name: string;
  /** "Chilonzor, Toshkent". */
  area: string;
  /** "@barberim_uz_bot". */
  bot: string;
  /** "4,8 ★ · 25" or null with no reviews yet. */
  rating: string | null;
  /** "60 000 soʻmdan" or null. */
  fromPrice: string | null;
  qr: string;
};

/** Mint wall tiles with chrome grout, the shop's background in the app. */
function tiles(size: number): CSSProperties {
  const line = 'rgba(15,51,43,0.09)';
  return {
    backgroundColor: C.tile,
    backgroundImage: `linear-gradient(to right, ${line} 2px, transparent 2px), linear-gradient(to bottom, ${line} 2px, transparent 2px)`,
    backgroundSize: `${size}px ${size}px`,
  };
}

/** The shop's name on a red enamel sign with its white keyline. */
function Sign({ overline, name, size }: { overline: string; name: string; size: number }) {
  return (
    <div
      style={{
        display: 'flex',
        backgroundColor: C.enamel,
        borderRadius: size * 0.16,
        padding: size * 0.1,
        boxShadow: '0 18px 40px -18px rgba(80,0,10,0.6)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          border: `${Math.max(2, size * 0.035)}px solid rgba(255,255,255,0.6)`,
          borderRadius: size * 0.08,
          padding: `${size * 0.22}px ${size * 0.32}px ${size * 0.26}px`,
          color: C.onEnamel,
        }}
      >
        <div
          style={{
            fontFamily: SIGN,
            fontSize: size * 0.3,
            letterSpacing: size * 0.04,
            textTransform: 'uppercase',
            opacity: 0.85,
          }}
        >
          {overline}
        </div>
        <div
          style={{
            fontFamily: SIGN,
            fontSize: size,
            lineHeight: 1,
            textTransform: 'uppercase',
            marginTop: size * 0.06,
          }}
        >
          {name}
        </div>
      </div>
    </div>
  );
}

function QrPanel({ qr, size, caption }: { qr: string; size: number; caption: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: C.porcelain,
        border: `3px solid ${C.chrome}`,
        borderRadius: 32,
        padding: size * 0.09,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn into a PNG, not a page */}
      <img src={qr} width={size} height={size} alt="" />
      <div
        style={{
          marginTop: size * 0.07,
          fontSize: size * 0.06,
          fontWeight: 700,
          color: C.ink,
        }}
      >
        {caption}
      </div>
    </div>
  );
}

/** 1080 × 1920, for an Instagram story. */
export function StoryCard({ data, t }: { data: ShareCardData; t: Messages['share'] }) {
  return (
    <div
      style={{
        ...tiles(120),
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        // Instagram covers about 250px at the top (name bar) and bottom (reply box).
        padding: '260px 90px 270px',
        fontFamily: SANS,
        color: C.ink,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Sign overline={t.badge} name={data.name} size={96} />
        <div style={{ marginTop: 44, fontSize: 44, fontWeight: 700, textAlign: 'center' }}>
          {data.area}
        </div>
        {(data.rating || data.fromPrice) && (
          <div style={{ marginTop: 14, fontSize: 38, color: C.inkMuted, textAlign: 'center' }}>
            {[data.rating, data.fromPrice].filter(Boolean).join('  ·  ')}
          </div>
        )}
      </div>
      <QrPanel qr={data.qr} size={470} caption={t.scan} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ fontFamily: SIGN, fontSize: 76, lineHeight: 1.05, textAlign: 'center' }}>
          {t.bookOnline}
        </div>
        <div style={{ marginTop: 26, fontSize: 40, color: C.inkMuted }}>
          {`${t.orOpen}: ${data.bot}`}
        </div>
      </div>
    </div>
  );
}

function Step({ number, text }: { number: number; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginTop: 22 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: C.ink,
          color: C.porcelain,
          fontSize: 34,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {String(number)}
      </div>
      <div style={{ marginLeft: 24, fontSize: 34, color: C.ink }}>{text}</div>
    </div>
  );
}

/** A4 portrait at 150 dpi (1240 × 1754), for the shop's door or window. */
export function Poster({ data, t }: { data: ShareCardData; t: Messages['share'] }) {
  return (
    <div
      style={{
        ...tiles(100),
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '100px 100px 80px',
        fontFamily: SANS,
        color: C.ink,
      }}
    >
      <div style={{ fontFamily: SIGN, fontSize: 88, lineHeight: 1.02, textAlign: 'center' }}>
        {t.bookOnline}
      </div>
      <div style={{ display: 'flex', marginTop: 70 }}>
        <Sign overline={t.badge} name={data.name} size={80} />
      </div>
      <div style={{ marginTop: 30, fontSize: 36, fontWeight: 700 }}>{data.area}</div>
      <div style={{ display: 'flex', marginTop: 44 }}>
        <QrPanel qr={data.qr} size={440} caption={t.scan} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40, width: 920 }}>
        <Step number={1} text={t.step1} />
        <Step number={2} text={t.step2} />
        <Step number={3} text={t.step3} />
      </div>
      <div
        style={{
          marginTop: 'auto',
          paddingTop: 36,
          fontSize: 30,
          color: C.inkMuted,
          textAlign: 'center',
        }}
      >
        {`${t.free}  ·  ${data.bot}`}
      </div>
    </div>
  );
}
