// Demo content for the design preview only — not real shops, people or prices.

export const demoShop = {
  name: 'Ustoz Barbershop',
  address: 'Chilonzor, 9-kvartal · Novza metrosi yonida',
};

export const demoMasters = [
  { id: 'jasur', name: 'Jasur' },
  { id: 'sardor', name: 'Sardor' },
  { id: 'bekzod', name: 'Bekzod' },
];

export const demoDays = [
  { id: '2', weekday: 'Du', day: 2 },
  { id: '3', weekday: 'Se', day: 3 },
  { id: '4', weekday: 'Ch', day: 4 },
  { id: '5', weekday: 'Pa', day: 5 },
  { id: '6', weekday: 'Ju', day: 6 },
  { id: '7', weekday: 'Sh', day: 7 },
];

export const demoSlots = [
  { time: '10:00', taken: true },
  { time: '10:40', taken: false },
  { time: '11:20', taken: false },
  { time: '12:00', taken: true },
  { time: '12:40', taken: false },
  { time: '14:00', taken: false },
  { time: '14:40', taken: false },
  { time: '15:20', taken: true },
];

export const demoService = { name: 'Soch olish', minutes: 40, price: '60 000 soʻm' };

export const demoToday = {
  title: 'Bugun',
  date: 'Seshanba, 3-noyabr',
  summary: '6 ta mijoz · 420 000 soʻm',
  rows: [
    { time: '10:00', title: 'Aziz Karimov', detail: 'Soch + soqol', trail: '90 000' },
    { time: '10:40', title: 'Boʻsh', state: 'free', trail: '+ Qoʻshish' },
    {
      time: '11:20',
      title: 'Timur',
      detail: 'Soch olish · navbatsiz · hozir',
      trail: '60 000',
      state: 'current',
    },
    { time: '12:00', title: 'Diyor Rahimov', detail: 'Bolalar soch olishi', trail: '40 000' },
    { time: '13:20', title: 'Tushlik', state: 'break' },
    { time: '14:00', title: 'Otabek Yusupov', detail: 'Kuyov paketi', trail: '250 000' },
    { time: '16:00', title: 'Rustam A.', detail: 'Soch olish', trail: '60 000' },
  ],
} as const;
