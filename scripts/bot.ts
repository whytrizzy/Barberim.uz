import { Telegraf, Markup } from 'telegraf';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

if (!BOT_TOKEN || BOT_TOKEN.includes('123456789')) {
  console.warn('⚠️ TELEGRAM_BOT_TOKEN is not set or using placeholder token.');
  console.warn('Telegram bot script requires a valid BotFather token to connect.');
}

const bot = new Telegraf(BOT_TOKEN || 'DUMMY_TOKEN');

// Start command with deep-linking handler
bot.start(async (ctx) => {
  const startPayload = ctx.startPayload; // e.g. "barber_barber-profile-1"
  const userName = ctx.from?.first_name || 'Friend';

  if (startPayload && startPayload.startsWith('barber_')) {
    const barberId = startPayload.replace('barber_', '');
    console.log(`🤖 Deep link detected for Barber ID: ${barberId}`);

    const miniAppUrl = `${APP_URL}?start=barber_${barberId}`;

    return ctx.reply(
      `👋 **Salam ${userName}!**\n\nYou were invited to book a haircut directly with your barber on **Barberim.uz**.\n\nTap the button below to view available services and choose your time slot! ✂️`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.webApp('✂️ Book Appointment Now', miniAppUrl)],
          [Markup.button.url('📱 Share with Friends', `https://t.me/share/url?url=https://t.me/${ctx.botInfo?.username}?start=barber_${barberId}`)],
        ]),
      }
    );
  }

  // General /start greeting
  return ctx.reply(
    `💈 **Welcome to Barberim.uz!**\n\nThe premier Telegram Mini App for scheduling haircuts and managing barber appointments in Uzbekistan.\n\nChoose an option below:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.webApp('🚀 Open Client App', APP_URL)],
        [Markup.button.webApp('⚙️ Barber Admin Panel', `${APP_URL}?role=BARBER`)],
      ]),
    }
  );
});

bot.command('help', (ctx) => {
  ctx.reply(
    `ℹ️ **Barberim Help & Instructions**\n\n- Barbers can generate a personal booking link in the Admin Panel.\n- Clients can open the link to select services and pick available time slots.\n\nNeed support? Contact @BarberimSupport.`,
    { parse_mode: 'Markdown' }
  );
});

if (BOT_TOKEN && !BOT_TOKEN.includes('123456789')) {
  bot.launch().then(() => {
    console.log('🤖 Telegram Bot @' + bot.botInfo?.username + ' is running!');
  }).catch((err) => {
    console.error('❌ Failed to start Telegraf bot:', err.message);
  });
} else {
  console.log('💡 Telegraf Bot script compiled ready. Pass a valid BOT_TOKEN in .env to run online.');
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
