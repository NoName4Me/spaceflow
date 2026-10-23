/** Pure scheduling policies. Server must additionally protect writes with a DB exclusion constraint. */
export const ACTIVE=new Set(['confirmed','pending']);
export const overlaps=(aStart,aEnd,bStart,bEnd)=>aStart<bEnd && bStart<aEnd;
export function validateWindow(start,end){
  if(typeof start!=='string'||typeof end!=='string'||!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end)||start>=end)throw new Error('invalid interval');
  const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);
  if(sh>23||eh>23||sm>59||em>59)throw new Error('invalid clock');
}
export function conflicts(bookings,{roomId,date,start,end,excludeId}){
  validateWindow(start,end);
  return bookings.filter(b=>ACTIVE.has(b.status)&&b.roomId===roomId&&b.date===date&&b.id!==excludeId&&overlaps(start,end,b.start,b.end));
}
/** Date-only recurrence expansion in UTC to avoid local DST drift; real system stores IANA timezone and UTC instants. */
export function expandWeekly({firstDate,weeks,weekday}){
  if(!Number.isInteger(weeks)||weeks<1||weeks>52)throw new Error('invalid count');
  const first=new Date(`${firstDate}T12:00:00Z`);
  if(Number.isNaN(first.valueOf())||weekday<0||weekday>6)throw new Error('invalid date/weekday');
  const delta=(weekday-first.getUTCDay()+7)%7;first.setUTCDate(first.getUTCDate()+delta);
  return Array.from({length:weeks},(_,i)=>{const d=new Date(first);d.setUTCDate(first.getUTCDate()+7*i);return d.toISOString().slice(0,10)});
}
