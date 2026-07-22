'use client';

import React, { useState } from 'react';
import { BarberProfileType, ServiceType, BookingType, WorkingHours, BookingStatus } from '@/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { ProfileSettings } from './ProfileSettings';
import { ServiceManager } from './ServiceManager';
import { ScheduleManager } from './ScheduleManager';
import { BookingManager } from './BookingManager';
import { Calendar, Scissors, Settings, Clock } from 'lucide-react';

interface BarberDashboardProps {
  profile: BarberProfileType;
  services: ServiceType[];
  bookings: BookingType[];
  onUpdateProfile: (data: { bio: string; address: string }) => Promise<void>;
  onAddService: (newService: { name: string; durationMinutes: number; price: number }) => Promise<void>;
  onDeleteService: (serviceId: string) => Promise<void>;
  onUpdateSchedule: (schedule: WorkingHours) => Promise<void>;
  onUpdateBookingStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
}

export function BarberDashboard({
  profile,
  services,
  bookings,
  onUpdateProfile,
  onAddService,
  onDeleteService,
  onUpdateSchedule,
  onUpdateBookingStatus,
}: BarberDashboardProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'BOOKINGS' | 'SERVICES' | 'SCHEDULE' | 'PROFILE'>('BOOKINGS');

  const activeBookingsCount = bookings.filter((b) => b.status === 'CONFIRMED').length;

  return (
    <div className="space-y-4">
      {/* Navigation Tabs */}
      <div className="grid grid-cols-4 gap-1 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800">
        <button
          onClick={() => setActiveTab('BOOKINGS')}
          className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-semibold transition-all relative ${
            activeTab === 'BOOKINGS'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4 mb-1" />
          <span>{t('tabBookings')}</span>
          {activeBookingsCount > 0 && activeTab !== 'BOOKINGS' && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-slate-950 rounded-full text-[10px] font-bold flex items-center justify-center border border-slate-900">
              {activeBookingsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('SERVICES')}
          className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'SERVICES'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Scissors className="w-4 h-4 mb-1" />
          <span>{t('tabServices')}</span>
        </button>

        <button
          onClick={() => setActiveTab('SCHEDULE')}
          className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'SCHEDULE'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-4 h-4 mb-1" />
          <span>{t('tabSchedule')}</span>
        </button>

        <button
          onClick={() => setActiveTab('PROFILE')}
          className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'PROFILE'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Settings className="w-4 h-4 mb-1" />
          <span>{t('tabProfile')}</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'BOOKINGS' && (
        <BookingManager bookings={bookings} onUpdateStatus={onUpdateBookingStatus} />
      )}
      {activeTab === 'SERVICES' && (
        <ServiceManager
          services={services}
          onAddService={onAddService}
          onDeleteService={onDeleteService}
        />
      )}
      {activeTab === 'SCHEDULE' && (
        <ScheduleManager workingHours={profile.workingHours} onSaveSchedule={onUpdateSchedule} />
      )}
      {activeTab === 'PROFILE' && (
        <ProfileSettings profile={profile} onSave={onUpdateProfile} />
      )}
    </div>
  );
}
