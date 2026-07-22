# Barberim.uz - Telegram Mini App MVP ✂️

An all-in-one Telegram Mini App for barbers and clients to manage haircut appointments, working schedules, and direct social media referral links in Uzbekistan.

---

## 🌟 Key Features

### 💈 Barber Admin Panel
- **Profile Setup**: Manage barber name, phone, bio, and salon address.
- **Service Management**: CRUD operations for services (Name, Duration in mins, Price in UZS).
- **Working Schedule**: Configure working days, start/end hours (e.g., 09:00 - 20:00), and lunch break times (13:00 - 14:00).
- **Booking Management**: Calendar list view of active bookings with client name, phone number, selected services, time slot, and status controls (Complete / Cancel).
- **Social Referral Link Generator**: Dedicated 1-click button to copy unique Telegram link (`t.me/BarberimBot?start=barber_{id}`) for Instagram Bio & Telegram channels.

### 📱 Client Interface
- **Direct Booking Flow**:
  1. Opens Mini App directly on the shared Barber's Profile.
  2. Selects one or multiple services with real-time total duration & price calculation.
  3. Chooses date from horizontal datepicker.
  4. Selects open time slot calculated dynamically based on total duration, working hours, lunch break, and existing bookings.
  5. Confirms booking with phone number.
- **Booking Management**: View upcoming appointments and past booking history with cancellation option.

---

## 🗄️ Database Schema (PostgreSQL + Prisma ORM)

- `User`: `id`, `telegram_id` (BigInt), `role` (`CLIENT`, `BARBER`), `phone`, `full_name`, `created_at`
- `BarberProfile`: `id`, `user_id` (FK), `bio`, `address`, `working_hours` (JSON)
- `Service`: `id`, `barber_id` (FK), `name`, `duration_minutes`, `price` (UZS)
- `Booking`: `id`, `client_id` (FK), `barber_id` (FK), `start_time`, `end_time`, `total_price`, `status` (`PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED`)

---

## 🚀 Getting Started

### 1. Installation
```bash
npm install
```

### 2. Database Migration & Seed
```bash
# Push Prisma schema to PostgreSQL
npm run db:push

# Seed test data (Barber, Services, Schedule, Client & Sample Booking)
npm run db:seed
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Run Telegram Bot Handler
```bash
npm run bot
```

---

## 🤖 Telegram Deep-Link Format

Shareable link format:
`https://t.me/BarberimBot?start=barber_{barber_id}`

When a client clicks this link in Telegram:
1. The Telegram Bot greets the client with a customized welcome message.
2. An inline WebApp button launches the Mini App directly pre-loaded on that Barber's profile.
