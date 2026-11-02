// Cargo liveries are kept separate so the main aircraft/livery catalog can be
// merged by the integration owner without colliding with passenger-livery work.
export const CARGO_LIVERIES = [
  {
    id: 'fedex',
    file: 'fedex.png',
    name: '联邦快递',
    en: 'FEDEX EXPRESS',
    color: '#4d148c',
    symbol: 'FX',
    logo: 'fedex.png',
    colors: {
      base: '#f8f7f5',
      primary: '#4d148c',
      secondary: '#ffffff',
      accent: '#ff6600',
    },
    markText: 'FedEx · FedEx Express',
    description: '白色机身、紫色机尾与腹部，紫橙双色 FedEx 字标；原创排版图形。',
  },
  {
    id: 'sf',
    file: 'sf.png',
    name: '顺丰航空货运',
    en: 'SF AIRLINES',
    color: '#282a2d',
    symbol: 'SF',
    logo: 'sf-express.png',
    colors: {
      base: '#f8f7f5',
      primary: '#282a2d',
      secondary: '#73777a',
      accent: '#c8102e',
    },
    markText: 'AIRLINES · 顺丰航空 · SF',
    description: '白/浅灰机身、黑色垂尾与白色环状 SF 标志；下腹多道黑灰线、向尾部延伸的红色斜带及深色发动机罩。字样与环形图案为原创绘制。',
  },
];
