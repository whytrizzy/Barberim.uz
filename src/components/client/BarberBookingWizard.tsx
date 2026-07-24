'use client';

import React, { useState, useEffect } from 'react';
import { BarberProfileType, ServiceType, TimeSlot, BookingType } from '@/types';
import { useAuth } from '@/lib/AuthContext';
import { apiFetch } from '@/lib/apiClient';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { TimeSlotPicker } from './TimeSlotPicker';
import { MapPin, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { tashkentDateOption, formatTashkentDate, formatTashkentTime, formatUZS } from '@/lib/dateUtils';

interface BarberBookingWizardProps {
  barber: BarberProfileType;
  onBookingComplete: (booking: BookingType) => void;
}

export function BarberBookingWizard({ barber, onBookingComplete }: BarberBookingWizardProps) {
  const { t } = useLanguage();
  const { user } = useAuth();

  // ─── Services ───────────────────────────────────────────────────
  const [services, setServices] = useState<ServiceType[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);

  useEffect(() => {
    const fetchServices = async () => {
      setLoadingServices(true);
      try {
        const res = await fetch(`/api/barbers/${barber.id}/services`);
        const data = await res.json();
        if (data.success) {
          setServices(data.services || []);
        }
      } catch (err) {
        console.error('Failed to fetch barber services:', err);
        setServices(barber.services || []);
      } finally {
        setLoadingServices(false);
      }
    };
    fetchServices();
  }, [barber.id, barber.services]);

  // ─── Booking state ──────────────────────────────────────────────
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => tashkentDateOption(0).isoDate);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [step, setStep] = useState<'SERVICES' | 'SLOT' | 'CONFIRM' | 'SUCCESS'>('SERVICES');
  const [submitting, setSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<BookingType | null>(null);

  const selectedServices = services.filter((s) => selectedServiceIds.includes(s.id));
  const totalDurationMinutes = selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0) || 30;
  const totalPrice = selectedServices.reduce((sum, s) => sum + s.price, 0);

  const toggleService = (id: string) => {
    if (selectedServiceIds.includes(id)) {
      setSelectedServiceIds(selectedServiceIds.filter((sid) => sid !== id));
    } else {
      setSelectedServiceIds([...selectedServiceIds, id]);
    }
  };

  const dateOptions = Array.from({ length: 14 }).map((_, i) => tashkentDateOption(i));

  useEffect(() => {
    // Only (re)load slots on the SLOT step. Fetching on CONFIRM used to reset
    // selectedSlot and unmount the confirm screen (booking became impossible).
    if (step === 'SLOT') {
      fetchSlots();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, totalDurationMinutes, step]);

  const fetchSlots = async () => {
    setLoadingSlots(true);
    setSelectedSlot(null);
    try {
      const res = await fetch(
        `/api/barbers/${barber.id}/slots?date=${selectedDate}&duration=${totalDurationMinutes}`
      );
      const data = await res.json();
      if (data.success) {
        setAvailableSlots(data.slots || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleCreateBooking = async () => {
    if (!user?.id) { setErrorMsg('Xatolik: foydalanuvchi aniqlanmadi'); return; }
    if (selectedServiceIds.length === 0) { setErrorMsg('Xizmat tanlanmagan'); return; }
    if (!selectedSlot) { setErrorMsg('Vaqt tanlanmagan'); return; }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barberId: barber.id,
          serviceIds: selectedServiceIds,
          startTime: selectedSlot.isoString,
        }),
      });

      const data = await res.json();
      if (data.success && data.booking) {
        setErrorMsg(null);
        setConfirmedBooking(data.booking);
        setStep('SUCCESS');
        onBookingComplete(data.booking);
      } else {
        setErrorMsg(`Server (${res.status}): ${data.message || data.error || 'Booking yaratilmadi'}`);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Tarmoq xatosi: ' + (err?.message || 'nomaʼlum'));
    } finally {
      setSubmitting(false);
    }
  };

  const displayName = barber.shopName || barber.user?.fullName || t('roleBarber');
  const initial = displayName.trim().charAt(0).toUpperCase();

  return (
    <div className="pb-6 view-fade">
      {errorMsg && (
        <div
          onClick={() => setErrorMsg(null)}
          style={{ position: 'fixed', top: '45%', left: 12, right: 12, zIndex: 99999 }}
          className="bg-danger/90 text-white text-sm font-bold rounded-2xl p-4 shadow-2xl flex items-start gap-2 cursor-pointer"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="break-words">{errorMsg}</span>
        </div>
      )}

      {/* ── Hero header ── */}
      {step !== 'SUCCESS' && (
        <div
          className="relative rounded-card overflow-hidden flex items-end p-4 h-[150px] mb-4"
          style={{ background: 'linear-gradient(135deg,#2c3543,#12171f)' }}
        >
          <span className="absolute right-4 top-2 text-[70px] opacity-[0.06] select-none">✂</span>
          <div className="flex items-center gap-3.5">
            <div className="w-[56px] h-[56px] rounded-2xl bg-gradient-to-br from-gold to-gold-600 flex items-center justify-center text-2xl font-black text-gold-ink border-2 border-white/15">
              {initial}
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white">{displayName}</h2>
              {barber.address && (
                <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-gold shrink-0" /> {barber.address}
                </p>
              )}
              {barber.workingHours?.startTime && (
                <p className="text-xs text-gold mt-1">
                  🕐 {barber.workingHours.startTime}–{barber.workingHours.endTime}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 1: Services ── */}
      {step === 'SERVICES' && (
        <div>
          <div className="cap mb-1">{t('step1Services')}</div>

          {loadingServices ? (
            <div className="py-8 text-center space-y-2">
              <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-muted">{t('loading')}</p>
            </div>
          ) : services.length === 0 ? (
            <div className="py-8 text-center card space-y-2 mt-2">
              <AlertCircle className="w-8 h-8 text-dim mx-auto" />
              <p className="text-xs text-muted">{t('noServices')}</p>
            </div>
          ) : (
            services.map((service) => {
              const isSelected = selectedServiceIds.includes(service.id);
              return (
                <div
                  key={service.id}
                  onClick={() => toggleService(service.id)}
                  className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3.5 mt-2.5 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-gold bg-gold/[0.07]'
                      : 'bg-surface border-line'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center text-sm font-black shrink-0 transition-all ${
                      isSelected
                        ? 'bg-gold border-gold text-gold-ink'
                        : 'border-line text-transparent'
                    }`}
                  >
                    ✓
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white">{service.name}</div>
                    <div className="text-[11.5px] text-muted mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gold" /> {service.durationMinutes} {t('durationMins')}
                    </div>
                  </div>
                  <div className="text-sm font-extrabold text-gold shrink-0">
                    {formatUZS(service.price)}
                  </div>
                </div>
              );
            })
          )}

          {selectedServiceIds.length > 0 && (
            <div className="mainbtn-wrap">
              <Button variant="primary" size="lg" fullWidth onClick={() => setStep('SLOT')}>
                {totalDurationMinutes} daq · {formatUZS(totalPrice)} — {t('chooseDateTime')} →
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Date & time ── */}
      {step === 'SLOT' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="cap">{t('step2Slot')}</div>
            <button onClick={() => setStep('SERVICES')} className="text-xs text-gold font-bold">
              ‹ {t('back')}
            </button>
          </div>

          {/* Date strip */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {dateOptions.map((item) => {
              const isSelected = selectedDate === item.isoDate;
              return (
                <button
                  key={item.isoDate}
                  onClick={() => setSelectedDate(item.isoDate)}
                  className={`flex flex-col items-center justify-center rounded-2xl min-w-[56px] py-2.5 border transition-all shrink-0 ${
                    isSelected
                      ? 'bg-gradient-to-br from-gold to-gold-600 text-gold-ink border-transparent font-bold'
                      : 'bg-surface text-muted border-line'
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold opacity-75">{item.dayName}</span>
                  <span className="text-lg font-extrabold my-0.5">{item.dayNum}</span>
                  <span className="text-[10px] opacity-75">{item.monthName}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-4 mb-2.5">
            <div className="cap">{t('step2Slot')}</div>
            <div className="text-xs text-muted">
              {totalDurationMinutes} daq · <span className="text-ok">●</span> bo&apos;sh <span className="text-dim">●</span> band
            </div>
          </div>

          <TimeSlotPicker
            slots={availableSlots}
            selectedSlot={selectedSlot}
            onSelectSlot={(slot) => setSelectedSlot(slot)}
            loading={loadingSlots}
          />

          <div className="flex gap-2 bg-gold/[0.06] border border-gold/20 rounded-xl px-3.5 py-2.5 text-xs text-gold/90 mt-4">
            🕐 Vaqtlar Toshkent (UTC+5) bo&apos;yicha
          </div>

          {selectedSlot && (
            <div className="mainbtn-wrap">
              <Button variant="primary" size="lg" fullWidth onClick={() => setStep('CONFIRM')}>
                {selectedSlot.time} — {t('confirmBooking')} →
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Confirm ── */}
      {step === 'CONFIRM' && selectedSlot && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="cap">{t('step3Confirm')}</div>
            <button onClick={() => setStep('SLOT')} className="text-xs text-gold font-bold">
              ‹ {t('back')}
            </button>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-gold to-gold-600 flex items-center justify-center text-lg font-black text-gold-ink">
                {initial}
              </div>
              <div>
                <div className="text-[15px] font-bold text-white">{displayName}</div>
                {barber.address && <div className="text-[11px] text-muted">📍 {barber.address}</div>}
              </div>
            </div>

            <div className="h-px bg-line my-3" />
            <div className="flex justify-between text-sm">
              <span className="text-muted">Sana</span>
              <span className="font-bold text-white">{formatTashkentDate(selectedSlot.isoString, true)}</span>
            </div>
            <div className="flex justify-between text-sm mt-2.5">
              <span className="text-muted">Vaqt</span>
              <span className="font-bold text-white">
                {selectedSlot.time} – {formatTashkentTime(new Date(new Date(selectedSlot.isoString).getTime() + totalDurationMinutes * 60000))}
              </span>
            </div>
            <div className="flex justify-between text-sm mt-2.5">
              <span className="text-muted">{t('tabServices')}</span>
              <span className="font-bold text-white text-right max-w-[180px]">
                {selectedServices.map((s) => s.name).join(', ')}
              </span>
            </div>
            <div className="h-px bg-line my-3" />
            <div className="flex justify-between items-center">
              <span className="font-bold text-white">{t('total')}</span>
              <span className="text-lg font-extrabold text-gold">{formatUZS(totalPrice)}</span>
            </div>
          </div>

          <div className="flex gap-2 bg-blue/[0.08] border border-blue/25 rounded-xl px-3.5 py-2.5 text-xs text-[#bcd8ff] mt-3">
            💳 To&apos;lov joyida (naqd/karta) · oldindan to&apos;lov shart emas
          </div>

          <div className="mainbtn-wrap">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={submitting}
              onClick={handleCreateBooking}
            >
              {submitting ? t('saving') : `✂️ ${t('confirmBooking')}`}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Success ── */}
      {step === 'SUCCESS' && confirmedBooking && (
        <div className="text-center py-10 px-4 view-fade">
          <div className="w-[84px] h-[84px] rounded-full mx-auto flex items-center justify-center text-ok border border-ok/30"
            style={{ background: 'radial-gradient(circle, rgba(82,217,138,.25), rgba(82,217,138,.08))' }}>
            <CheckCircle2 className="w-11 h-11 stroke-[2.5]" />
          </div>

          <h3 className="text-xl font-extrabold text-white mt-4">{t('bookingSuccessTitle')}</h3>
          <p className="text-sm text-muted mt-1">
            {displayName} — {formatTashkentDate(confirmedBooking.startTime)} · {formatTashkentTime(confirmedBooking.startTime)}
          </p>

          <div className="flex gap-2 bg-blue/[0.08] border border-blue/25 rounded-xl px-3.5 py-2.5 text-xs text-[#bcd8ff] mt-5 text-left">
            🔔 Booking&apos;dan oldin Telegram&apos;da eslatib qo&apos;yamiz
          </div>

          <Button
            variant="secondary"
            size="lg"
            fullWidth
            className="mt-4"
            onClick={() => {
              setStep('SERVICES');
              setSelectedServiceIds([]);
              setSelectedSlot(null);
            }}
          >
            {t('done')}
          </Button>
        </div>
      )}
    </div>
  );
}
