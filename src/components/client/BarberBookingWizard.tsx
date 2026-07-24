'use client';

import React, { useState, useEffect } from 'react';
import { BarberProfileType, ServiceType, TimeSlot, BookingType } from '@/types';
import { useAuth } from '@/lib/AuthContext';
import { apiFetch } from '@/lib/apiClient';
import { getTelegramWebApp } from '@/lib/telegramWebApp';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { TimeSlotPicker } from './TimeSlotPicker';
import { MapPin, Phone, Clock, CheckCircle2, Scissors, ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';

interface BarberBookingWizardProps {
  barber: BarberProfileType;
  onBookingComplete: (booking: BookingType) => void;
}

export function BarberBookingWizard({ barber, onBookingComplete }: BarberBookingWizardProps) {
  const { t } = useLanguage();
  const { user } = useAuth();

  // ─── Services: Fetch independently from DB ──────────────────────
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
        // Fallback to whatever was passed in barber.services
        setServices(barber.services || []);
      } finally {
        setLoadingServices(false);
      }
    };

    fetchServices();
  }, [barber.id, barber.services]);

  // ─── Booking State ──────────────────────────────────────────────
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'SERVICES' | 'SLOT' | 'CONFIRM' | 'SUCCESS'>('SERVICES');
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

  const dateOptions = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const isoDate = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = d.getDate();
    const monthName = d.toLocaleDateString('en-US', { month: 'short' });
    return { isoDate, dayName, dayNum, monthName };
  });

  useEffect(() => {
    if (step === 'SLOT' || step === 'CONFIRM') {
      fetchSlots();
    }
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
    // TEMP diagnostic: proves the button handler actually fired (fixed banner, always visible).
    setErrorMsg('2) FINAL Tasdiqlash bosildi — booking yaratilmoqda...');

    if (!user?.id) { setErrorMsg('DIAG: foydalanuvchi aniqlanmadi (user.id yoʻq)'); return; }
    if (selectedServiceIds.length === 0) { setErrorMsg('DIAG: xizmat tanlanmagan'); return; }
    if (!selectedSlot) { setErrorMsg('DIAG: vaqt tanlanmagan'); return; }

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
      setErrorMsg('Tarmoq/parse xatosi: ' + (err?.message || 'nomaʼlum'));
    } finally {
      setSubmitting(false);
    }
  };

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat('uz-UZ').format(val) + ' UZS';
  };

  const displayName = barber.shopName || barber.user?.fullName || t('roleBarber');

  return (
    <div className="space-y-4 pb-6">
      {errorMsg && (
        <div
          onClick={() => setErrorMsg(null)}
          style={{ position: 'fixed', top: '45%', left: 12, right: 12, zIndex: 99999 }}
          className="bg-red-600 border-2 border-red-300 text-white text-sm font-bold rounded-2xl p-4 shadow-2xl flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="break-words">{errorMsg} (yopish uchun bosing)</span>
        </div>
      )}
      {/* Barber Header Card */}
      <div className="glass-card-gold rounded-2xl p-4 flex items-start gap-3.5 relative">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-600 flex items-center justify-center text-slate-950 font-black text-xl shadow-md shrink-0">
          ✂️
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-extrabold text-white">
            {displayName}
          </h2>
          {barber.address && (
            <p className="text-xs text-slate-300 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" /> {barber.address}
            </p>
          )}
          {barber.bio && (
            <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">{barber.bio}</p>
          )}
        </div>
      </div>

      {/* Step 1: Services */}
      {step === 'SERVICES' && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div className="border-b border-slate-800 pb-2.5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Scissors className="w-4 h-4 text-amber-400" /> {t('step1Services')}
            </h3>
          </div>

          {loadingServices ? (
            <div className="py-6 text-center space-y-2">
              <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400">{t('loading')}</p>
            </div>
          ) : services.length === 0 ? (
            <div className="py-6 text-center space-y-2 bg-slate-900/40 rounded-xl border border-slate-800">
              <AlertCircle className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-xs text-slate-400">{t('noServices')}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {services.map((service) => {
                const isSelected = selectedServiceIds.includes(service.id);
                return (
                  <div
                    key={service.id}
                    onClick={() => toggleService(service.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500 text-white shadow-sm'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-white flex items-center gap-2">
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold'
                              : 'border-slate-600'
                          }`}
                        >
                          {isSelected ? '✓' : ''}
                        </span>
                        {service.name}
                      </h4>
                      <span className="text-[11px] text-slate-400 flex items-center gap-1.5 pl-6">
                        <Clock className="w-3 h-3 text-amber-400" /> {service.durationMinutes} mins
                      </span>
                    </div>

                    <span className="text-xs font-extrabold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                      {formatPrice(service.price)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {selectedServiceIds.length > 0 && (
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  {t('total')} ({selectedServices.length})
                </span>
                <span className="text-sm font-extrabold text-amber-300">{formatPrice(totalPrice)}</span>
              </div>
              <Button
                variant="primary"
                size="md"
                onClick={() => setStep('SLOT')}
                className="gap-1.5"
              >
                {t('chooseDateTime')} <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Date & Time Slot */}
      {step === 'SLOT' && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" /> {t('step2Slot')}
              </h3>
            </div>
            <button
              onClick={() => setStep('SERVICES')}
              className="text-xs text-amber-400 hover:underline font-medium"
            >
              {t('back')}
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {dateOptions.map((item) => {
              const isSelected = selectedDate === item.isoDate;
              return (
                <button
                  key={item.isoDate}
                  onClick={() => setSelectedDate(item.isoDate)}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl min-w-[62px] border transition-all shrink-0 ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-md shadow-amber-500/20 scale-[1.03]'
                      : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wider opacity-80">{item.dayName}</span>
                  <span className="text-sm font-extrabold my-0.5">{item.dayNum}</span>
                  <span className="text-[10px] font-medium">{item.monthName}</span>
                </button>
              );
            })}
          </div>

          <TimeSlotPicker
            slots={availableSlots}
            selectedSlot={selectedSlot}
            onSelectSlot={(slot) => setSelectedSlot(slot)}
            loading={loadingSlots}
          />

          {selectedSlot && (
            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={() => { setErrorMsg("1) Vaqt tasdiqlash bosildi — keyingi ekranga o'tildi"); setStep('CONFIRM'); }}
              className="mt-4 gap-1.5"
            >
              {t('confirmBooking')} <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}

      {/* Step 3: Confirmation */}
      {step === 'CONFIRM' && selectedSlot && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div className="border-b border-slate-800 pb-2.5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {t('step3Confirm')}
            </h3>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs text-slate-400">Date & Time</span>
              <span className="text-xs font-bold text-amber-300">
                {selectedDate} @ {selectedSlot.time}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs text-slate-400">{t('tabServices')}</span>
              <span className="text-xs font-bold text-white text-right max-w-[180px]">
                {selectedServices.map((s) => s.name).join(', ')}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs text-slate-400">{t('durationMins')}</span>
              <span className="text-xs font-bold text-white">
                {totalDurationMinutes} mins
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">{t('total')}</span>
              <span className="text-sm font-extrabold text-emerald-400">{formatPrice(totalPrice)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button variant="secondary" size="md" onClick={() => setStep('SLOT')}>
              {t('back')}
            </Button>
            <Button
              variant="primary"
              size="md"
              fullWidth
              disabled={submitting}
              onClick={handleCreateBooking}
            >
              {submitting ? t('saving') : `✂️ ${t('confirmBooking')}`}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Success */}
      {step === 'SUCCESS' && confirmedBooking && (
        <div className="glass-card-gold rounded-2xl p-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
          </div>

          <div>
            <span className="text-xs uppercase tracking-wider text-amber-400 font-bold">{t('bookingSuccessTitle')}</span>
            <h3 className="text-xl font-extrabold text-white mt-1">{t('seeYouSoon')}</h3>
            <p className="text-xs text-slate-300 mt-1">{t('bookingSuccessMsg')}</p>
          </div>

          <Button
            variant="primary"
            size="md"
            fullWidth
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
