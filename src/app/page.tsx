'use client';

import React, { useState, useEffect } from 'react';
import { Role, BarberProfileType, ServiceType, BookingType, WorkingHours, BookingStatus } from '@/types';
import { initTelegramWebApp, getTelegramStartParam } from '@/lib/telegramWebApp';
import { Header } from '@/components/Header';
import { BarberDashboard } from '@/components/barber/BarberDashboard';
import { ClientDashboard } from '@/components/client/ClientDashboard';
import { OnboardingModal } from '@/components/OnboardingModal';
import { Scissors } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function Home() {
  const { t } = useLanguage();
  const [role, setRole] = useState<Role | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profile, setProfile] = useState<BarberProfileType | null>(null);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [barberBookings, setBarberBookings] = useState<BookingType[]>([]);
  const [clientBookings, setClientBookings] = useState<BookingType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initTelegramWebApp();

    // Check saved role or deep-link parameter
    const savedRole = localStorage.getItem('barberim_user_role') as Role;
    const startParam = getTelegramStartParam();

    if (savedRole === 'CLIENT' || savedRole === 'BARBER') {
      setRole(savedRole);
    } else if (startParam && startParam.startsWith('barber_')) {
      setRole('CLIENT');
      localStorage.setItem('barberim_user_role', 'CLIENT');
    } else {
      setShowOnboarding(true);
    }

    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Barber Profile
      const profRes = await fetch('/api/barber/profile');
      const profData = await profRes.json();
      if (profData.success) {
        setProfile(profData.profile);
      }

      // 2. Fetch Services
      const servRes = await fetch('/api/barber/services');
      const servData = await servRes.json();
      if (servData.success) {
        setServices(servData.services);
      }

      // 3. Fetch Barber Bookings
      const bbRes = await fetch('/api/barber/bookings');
      const bbData = await bbRes.json();
      if (bbData.success) {
        setBarberBookings(bbData.bookings);
      }

      // 4. Fetch Client Bookings
      const cbRes = await fetch('/api/client/bookings');
      const cbData = await cbRes.json();
      if (cbData.success) {
        setClientBookings(cbData.bookings);
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOnboardingComplete = (selectedRole: Role) => {
    setRole(selectedRole);
    setShowOnboarding(false);
  };

  // Barber Handler Actions
  const handleUpdateProfile = async (data: { bio: string; address: string }) => {
    const res = await fetch('/api/barber/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (result.success) {
      setProfile(result.profile);
    }
  };

  const handleAddService = async (newService: { name: string; durationMinutes: number; price: number }) => {
    const res = await fetch('/api/barber/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newService),
    });
    const result = await res.json();
    if (result.success) {
      setServices([...services, result.service]);
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    const res = await fetch(`/api/barber/services/${serviceId}`, {
      method: 'DELETE',
    });
    const result = await res.json();
    if (result.success) {
      setServices(services.filter((s) => s.id !== serviceId));
    }
  };

  const handleUpdateSchedule = async (schedule: WorkingHours) => {
    const res = await fetch('/api/barber/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingHours: schedule }),
    });
    const result = await res.json();
    if (result.success) {
      setProfile(result.profile);
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, status: BookingStatus) => {
    const res = await fetch(`/api/barber/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const result = await res.json();
    if (result.success) {
      setBarberBookings(
        barberBookings.map((b) => (b.id === bookingId ? { ...b, status } : b))
      );
      setClientBookings(
        clientBookings.map((b) => (b.id === bookingId ? { ...b, status } : b))
      );
    }
  };

  // Client Handler Actions
  const handleBookingComplete = (booking: BookingType) => {
    setBarberBookings([booking, ...barberBookings]);
    setClientBookings([booking, ...clientBookings]);
  };

  const handleCancelClientBooking = async (bookingId: string) => {
    const res = await fetch(`/api/client/bookings/${bookingId}/cancel`, {
      method: 'PATCH',
    });
    const result = await res.json();
    if (result.success) {
      setClientBookings(
        clientBookings.map((b) => (b.id === bookingId ? { ...b, status: 'CANCELLED' } : b))
      );
      setBarberBookings(
        barberBookings.map((b) => (b.id === bookingId ? { ...b, status: 'CANCELLED' } : b))
      );
    }
  };

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-3 bg-slate-950">
        <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20 animate-bounce">
          <Scissors className="w-7 h-7 stroke-[2.5]" />
        </div>
        <p className="text-xs text-amber-400 font-bold tracking-wide">{t('loading')}</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen pb-10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Onboarding Modal for First-time users */}
      {showOnboarding && <OnboardingModal onComplete={handleOnboardingComplete} />}

      <Header currentRole={role || 'CLIENT'} />

      <div className="max-w-md mx-auto p-4">
        {role === 'BARBER' ? (
          <BarberDashboard
            profile={profile}
            services={services}
            bookings={barberBookings}
            onUpdateProfile={handleUpdateProfile}
            onAddService={handleAddService}
            onDeleteService={handleDeleteService}
            onUpdateSchedule={handleUpdateSchedule}
            onUpdateBookingStatus={handleUpdateBookingStatus}
          />
        ) : (
          <ClientDashboard
            barber={profile}
            clientBookings={clientBookings}
            onBookingComplete={handleBookingComplete}
            onCancelBooking={handleCancelClientBooking}
          />
        )}
      </div>
    </main>
  );
}
