// Real-world status of each catalog livery on this aircraft type.
// status: 'real'   = this airline/manufacturer flew this type with this livery.
//         'family' = flew the type family but not this exact variant/era; the airline's real livery is drawn.
//         'none'   = no such real aircraft exists; the livery is a compatibility adaptation.
// note: one short Chinese sentence shown under the livery list.
export const B747_REALITY={
 BOE:{status:'family',note:'波音 747-400 原型机 N401PW 为银色裸金属机身、蓝红线条与“747”尾标；本模型的白机身蓝腰线为波音厂色的近似适配，并非原型机涂装。'},
 CCA:{status:'real',note:'国航 747-400（如 B-2443、B-2447、B-2472）的红凤凰涂装。'},
 CEA:{status:'none',note:'东航没有 747 客机，仅旗下中国货运航空飞过 747 货机；此为东航客机涂装的适配。'},
 CSN:{status:'family',note:'南航只有货运 747-400F（B-2461、B-2473，约 2002–2022 年），没有 747 客机；客机涂装为适配。'},
 CHH:{status:'none',note:'海南航空从未运营过 747；此为兼容适配。'},
 UAE:{status:'none',note:'阿联酋没有 747 客机，天空货运曾租用 747-400F/ERF；此为客机涂装的兼容适配。'},
 BAW:{status:'real',note:'英航 747-400（G-BN**、G-CIV* 等），尾翼为 Chatham Dockyard 联合旗；2020 年已全部退役。'},
 KLM:{status:'real',note:'荷航 747-400（PH-BF*，共 22 架，1989–2021 年）的蓝色涂装。'},
 DLH:{status:'real',note:'汉莎 747-400（D-ABV*、D-ABT*）2018 年前的黄圈蓝尾、灰色机腹涂装。'},
 DLH100:{status:'none',note:'百年纪念涂装实际涂在 747-8I 上，747-400 并无此涂装；此为深蓝配色的兼容适配。'},
 AF1_CLASSIC:{status:'family',note:'空军一号 VC-25A 为 747-200B 改装，浅蓝白涂装；747-400 并非专机。'},
 AF1_2026:{status:'family',note:'白红金深蓝与星条圆徽用于 747-8I VC-25B；747-400 仅作同系列适配。'},
 fedex:{status:'family',note:'联邦快递飞过 747-100F/-200F，没有自有 747-400F；涂装为原创近似绘制。'},
 sf:{status:'real',note:'顺丰航空有 747-400F/ERF 货机（如 B-2423）；涂装为原创近似绘制。'},
};
