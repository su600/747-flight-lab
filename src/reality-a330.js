// Real-world status of each catalog livery on this aircraft type.
// status: 'real'   = this airline/manufacturer flew this type with this livery.
//         'family' = flew the type family but not this exact variant/era; the airline's real livery is drawn.
//         'none'   = no such real aircraft exists; the livery is a compatibility adaptation.
// note: one short Chinese sentence shown under the livery list.
// Model: FlightGear A330-303 (-300 fuselage, GE CF6-80E1). Engine type of individual airframes is not matched.
export const A330_REALITY={
 BOE:{status:'real',note:'空客原厂涂装：首架 A330-300 原型机 F-WWKA（1992 年首飞）——白色机身、深蓝斜带、彩虹渐变与 A330 字样。'},
 CCA:{status:'real',note:'国航运营 A330-200/-300；红色凤凰垂尾、蓝色腰线与灰色下机身（FlightGear 原版贴图）。'},
 CEA:{status:'real',note:'东航运营 A330-200/-300；白色机身、红蓝燕子垂尾（FlightGear 原版贴图）。'},
 CSN:{status:'real',note:'南航运营 A330-200/-300；蓝色垂尾配红色木棉花标志（FlightGear 原版贴图）。'},
 CHH:{status:'real',note:'海航运营 A330-200/-300；红色机尾配金色标志、红黄飘带与灰色下机身。'},
 UAE:{status:'family',note:'阿联酋航空运营过 A330（已核实 -200）；国旗色垂尾与古铜色 Emirates 字标，本模型为 -300 外形。'},
 BAW:{status:'none',note:'英国航空从未运营 A330；此为现行英航配色（深蓝下机身、红线、旗帜垂尾）的兼容适配。'},
 KLM:{status:'real',note:'荷航运营 A330-200/-300；蓝色机身配白色下腹（FlightGear 原版贴图）。'},
 DLH:{status:'real',note:'汉莎运营 A330-300（如 D-AIKA）；经典涂装：深蓝垂尾配黄色圆环鹤标，灰色下机身。'},
 DLH100:{status:'none',note:'汉莎百年纪念涂装涂于 747-8（D-ABYN），没有 A330 版本；此为兼容适配。'},
 AF1_CLASSIC:{status:'none',note:'空军一号为 VC-25（747-200B），没有 A330 版本；此为经典浅蓝配色的兼容适配。'},
 AF1_2026:{status:'none',note:'空军一号为波音 747，没有 A330 版本；此为 2026 版海蓝红金配色的兼容适配。'},
 fedex:{status:'none',note:'联邦快递没有运营 A330 货机（机队为 A300/767/777/MD-11 等）；此为货机外观的兼容适配。'},
 sf:{status:'none',note:'顺丰航空机队为 737/747/757/767，没有 A330；此为货机外观的兼容适配。'},
};
