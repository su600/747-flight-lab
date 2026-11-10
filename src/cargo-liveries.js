// Cargo liveries are kept separate so the main aircraft/livery catalog can be
// merged by the integration owner without colliding with passenger-livery work.
export const CARGO_LIVERIES = [
  {
    id: 'fedex',
    file: 'fedex-v2.png',
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
    description: '白色机身、紫色机尾，紫橙双色 FedEx 字标；按真实货机风格近似适配。',
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
    description: '白色机身、深灰下腹与多道黑/白细线、红色腰线；黑色垂尾与白色 SF 圆标，深色发动机罩配白色 SF 圆标。字样与环形图案为原创绘制。',
  },
];
