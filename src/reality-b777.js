// Real-world status of each catalog livery on this aircraft type.
// status: 'real'   = this airline/manufacturer flew this type with this livery.
//         'family' = flew the type family but not this exact variant/era; the airline's real livery is drawn.
//         'none'   = no such real aircraft exists; the livery is a compatibility adaptation.
// note: one short Chinese sentence shown under the livery list.
// Model: FlightGear 777-200LR (passenger) and 777F (freighter look for cargo liveries).
export const B777_REALITY={
 BOE:{status:'real',note:'波音 777-200LR “Worldliner” 试飞机（N6066Z）的厂商涂装。'},
 CCA:{status:'family',note:'国航运营 777-300ER 与 777F，没有 777-200LR；红凤凰涂装按其真实样式绘制。'},
 CEA:{status:'family',note:'东航运营 777-300ER，没有 777-200LR；涂装按其真实样式绘制。'},
 CSN:{status:'family',note:'南航运营 777-200/-300ER/777F，没有 777-200LR；涂装按其真实样式绘制。'},
 CHH:{status:'none',note:'海南航空没有运营过 777，真机无此涂装；此为兼容适配。'},
 UAE:{status:'real',note:'阿联酋航空运营 10 架 777-200LR（A6-EWA 等），白色机身、国旗色垂尾。'},
 BAW:{status:'family',note:'英航运营 777-200/-200ER/-300ER，没有 777-200LR；涂装按其真实样式绘制。'},
 KLM:{status:'family',note:'荷航运营 777-200ER/-300ER，没有 777-200LR；涂装按其真实样式绘制。'},
 DLH:{status:'family',note:'汉莎客机队没有 777，仅汉莎货运有 777F（货运涂装）；客机涂装为适配。'},
 DLH100:{status:'none',note:'未见 777 采用汉莎 100 周年涂装，真机无此涂装；此为兼容适配。'},
 AF1_CLASSIC:{status:'none',note:'空军一号只有波音 747，真机无 777 版本；此为兼容适配。'},
 AF1_2026:{status:'none',note:'空军一号只有波音 747，真机无 777 版本；此为兼容适配。'},
 fedex:{status:'real',note:'联邦快递运营大量 777F；涂装为原创近似绘制。'},
 sf:{status:'none',note:'未能核实顺丰航空有 777F，按货机外观的假想适配处理。'},
};
