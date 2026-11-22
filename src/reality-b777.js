// Real-world status of each catalog livery on this aircraft type.
// status describes real-world applicability, NOT paint accuracy: all atlases
// are approximations. 'family' and 'none' are compatibility adaptations.
// note: one short Chinese sentence shown under the livery list.
// Model: FlightGear 777-200LR (passenger) and 777F (freighter look for cargo liveries).
export const B777_REALITY={
 BOE:{status:'real',note:'参考波音 777-200LR “Worldliner” 厂商涂装的近似绘制，并非特定试飞机复刻。'},
 ANA:{status:'family',note:'参考全日空 777-200ER 标准涂装；全日空未运营 777-200LR，此为近似家族适配，并非实机复刻。'},
 CCA:{status:'family',note:'参考国航其他 777 型号，近似适配到 777-200LR，并非实机复刻。'},
 CEA:{status:'family',note:'参考东航其他 777 型号，近似适配到 777-200LR，并非实机复刻。'},
 CSN:{status:'family',note:'参考南航其他 777 型号，近似适配到 777-200LR，并非实机复刻。'},
 CHH:{status:'none',note:'未能核实海南航空有 777-200LR；此涂装为假想适配。'},
 UAE:{status:'real',note:'参考阿联酋航空 777-200LR 的旧版国旗色涂装；文字和细节为近似，非特定实机复刻。'},
 BAW:{status:'family',note:'参考英航其他 777 型号，近似适配到 777-200LR，并非实机复刻。'},
 KLM:{status:'family',note:'参考荷航其他 777 型号，近似适配到 777-200LR，并非实机复刻。'},
 DLH:{status:'none',note:'汉莎货运的 777F 不使用此客机涂装；777-200LR 客机涂装为假想适配。'},
 DLH100:{status:'none',note:'未见 777 采用汉莎 100 周年涂装，真机无此涂装；此为兼容适配。'},
 AF1_CLASSIC:{status:'none',note:'777-200LR 美国总统专机涂装为假想适配，并非实机复刻。'},
 AF1_2026:{status:'none',note:'777-200LR 美国总统专机涂装为假想适配，并非实机复刻。'},
 fedex:{status:'real',note:'联邦快递运营大量 777F；涂装为原创近似绘制。'},
 sf:{status:'none',note:'未能核实顺丰航空有 777F，按货机外观的假想适配处理。'},
};
