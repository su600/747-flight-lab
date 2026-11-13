import {B747_REALITY} from './reality-b747.js';
import {A380_REALITY} from './reality-a380.js';
import {A330_REALITY} from './reality-a330.js';
import {B777_REALITY} from './reality-b777.js';
import {SHUTTLE_REALITY} from './reality-shuttle.js';

const TABLES={b747:B747_REALITY,a380:A380_REALITY,a330:A330_REALITY,b777:B777_REALITY,shuttle:SHUTTLE_REALITY};
export const REALITY_LABELS={real:'真机涂装',family:'同系列机型',none:'真机无此涂装'};
// Missing entries are reported as adaptations so that an unreviewed livery is never presented as authentic.
export function realityFor(type,id){
 const entry=TABLES[type]?.[id];
 return entry?{status:entry.status,note:entry.note||'',label:REALITY_LABELS[entry.status]}:{status:'none',note:'',label:REALITY_LABELS.none};
}
