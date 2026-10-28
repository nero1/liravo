import type messages from '../../messages/en.json';
export type NotificationTextKey=`notificationMessages.${Exclude<keyof typeof messages.notificationMessages,'titles'>}`|`badgeNames.${keyof typeof messages.badgeNames}`;
interface Notice {type:string;message:string;message_key?:string|null;message_values?:Record<string,unknown>|null;}
type Translate=(key:NotificationTextKey,values?:Record<string,string|number>)=>string;
export function notificationText(notice:Notice,t:Translate,has:(key:NotificationTextKey)=>boolean,locale:string){
  const values:Record<string,string|number>={};
  for(const [key,value] of Object.entries(notice.message_values??{}))if(typeof value==='string')values[key]=value;else if(typeof value==='number'&&Number.isFinite(value))values[key]=value;
  values.name=typeof values.name==='string'&&values.name.trim()?values.name:t('notificationMessages.reader');
  values.content=typeof values.content==='string'?values.content:'';
  let key=notice.message_key??'activity';
  if(key==='tipAmount'){
    const amount=Number(values.amount),currency=String(values.currency??'');
    if(values.amount!==undefined&&String(values.amount).trim()!==''&&Number.isFinite(amount)&&amount>=0&&/^[A-Z]{3}$/.test(currency))values.amount=new Intl.NumberFormat(locale,{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:4}).format(amount);
    else key='tip';
  }
  if(key==='readingGoal'&&!['count','target','percent','year'].every(field=>values[field]!==undefined&&String(values[field]).trim()!==''&&Number.isFinite(Number(values[field]))))key='readingGoalGeneric';
  if(key==='badge'){
    const badgeKey=('badgeNames.'+String(values.badgeId??'')) as NotificationTextKey;
    values.badge=has(badgeKey)?t(badgeKey):values.badgeName||t('notificationMessages.badgeFallback');
  }
  const path=('notificationMessages.'+key) as NotificationTextKey;
  try{return has(path)?t(path,values):t('notificationMessages.activity');}catch{return t('notificationMessages.activity');}
}
