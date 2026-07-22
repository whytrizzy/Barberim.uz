'use client';

import React, { useState } from 'react';
import { BarberProfileType } from '@/types';
import { User, Phone, MapPin, FileText, Save, Check } from 'lucide-react';
import { Button } from '../ui/Button';

interface ProfileSettingsProps {
  profile: BarberProfileType;
  onSave: (updated: { bio: string; address: string }) => Promise<void>;
}

export function ProfileSettings({ profile, onSave }: ProfileSettingsProps) {
  const [fullName, setFullName] = useState(profile.user?.fullName || 'Sardor Barber');
  const [phone, setPhone] = useState(profile.user?.phone || '+998 90 123 45 67');
  const [address, setAddress] = useState(profile.address || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave({ bio, address });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <User className="w-4 h-4 text-amber-400" /> Barber Profile Setup
        </h3>
        {savedSuccess && (
          <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
            <Check className="w-3.5 h-3.5" /> Saved!
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Barber Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
          <div className="relative">
            <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              placeholder="e.g. Sardor Barber"
            />
          </div>
        </div>

        {/* Phone Number */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number</label>
          <div className="relative">
            <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              placeholder="+998 90 123 45 67"
            />
          </div>
        </div>

        {/* Salon Location Address */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Salon Location / Address</label>
          <div className="relative">
            <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              placeholder="e.g. Amir Temur Ave 42, Tashkent"
              required
            />
          </div>
        </div>

        {/* Bio / Services Description */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Bio / Barber Note</label>
          <div className="relative">
            <FileText className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              placeholder="Tell clients about your master experience, tools, and salon amenities..."
            />
          </div>
        </div>

        <Button type="submit" variant="primary" size="md" fullWidth disabled={loading}>
          {loading ? (
            'Saving Profile...'
          ) : (
            <span className="flex items-center justify-center gap-1.5">
              <Save className="w-4 h-4" /> Save Profile Details
            </span>
          )}
        </Button>
      </form>
    </div>
  );
}
