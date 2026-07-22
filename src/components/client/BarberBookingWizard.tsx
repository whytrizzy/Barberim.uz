'use client';

import React, { useState, useEffect } from 'react';
import { BarberProfileType, TimeSlot, BookingType } from '@/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { TimeSlotPicker } from './TimeSlotPicker';
import { MapPin, Phone, Clock, CheckCircle2, Scissors, ArrowRight, User } from 'lucide-react';
import { Button } from '../ui/Button';

interface BarberBookingWizardProps {
  barber: BarberProfileType;
  onBookingComplete: (booking: BookingType) => void;
}

export function BarberBookingWizard({ barber, onBookingComplete }: BarberBookingWizardProps) {
  const { t } = useLanguage();
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [clientPhone, setClientPhone] = useState('+998 90 123 45 67');
  const [clientName, setClientName] = useState('Client Guest');

  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'SERVICES' | 'SLOT' | 'CONFIRM' | 'SUCCESS'>('SERVICES');
  const [confirmedBooking, setConfirmedBooking] = useState<BookingType | null>(null);

  const services = barber.services || [];
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
    if (!selectedSlot || !clientPhone || selectedServiceIds.length === 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barberId: barber.id,
          clientId: `client-${Date.now()}`,
          clientName,
          clientPhone,
          serviceIds: selectedServiceIds,
          startTime: selectedSlot.isoString,
        }),
      });

      const data = await res.json();
      if (data.success && data.booking) {
        setConfirmedBooking(data.booking);
        setStep('SUCCESS');
        onBookingComplete(data.booking);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat('uz-UZ').format(val) + ' UZS';
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="glass-card-gold rounded-2xl p-4 flex items-start gap-3.5 relative">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-600 flex items-center justify-center text-slate-950 font-black text-xl shadow-md shrink-0">
          ✂️
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-extrabold text-white">
            {barber.user?.fullName || 'Sardor Barber'}
          </h2>
          <p className="text-xs text-slate-300 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" /> {barber.address}
          </p>
          <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">{barber.bio}</p>
        </div>
      </div>

      {step === 'SERVICES' && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div className="border-b border-slate-800 pb-2.5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Scissors className="w-4 h-4 text-amber-400" /> {t('step1Services')}
            </h3>
          </div>

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
              onClick={() => setStep('CONFIRM')}
              className="mt-4 gap-1.5"
            >
              {t('confirmBooking')} <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}

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

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">{t('total')}</span>
              <span className="text-sm font-extrabold text-emerald-400">{formatPrice(totalPrice)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">{t('fullName')}</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">{t('phone')}</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
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
              disabled={submitting || !clientPhone}
              onClick={handleCreateBooking}
            >
              {submitting ? t('saving') : `✂️ ${t('confirmBooking')}`}
            </Button>
          </div>
        </div>
      )}

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
