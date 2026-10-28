import {expect,it} from 'vitest';
import {createTranslator} from 'next-intl';
import {notificationText,type NotificationTextKey} from '@/lib/notification-message';
import {BADGE_DEFINITIONS} from '@/services/badges';
import en from '../messages/en.json';
import fr from '../messages/fr.json';
import de from '../messages/de.json';
it('renders stored notification facts in the reader’s language and preserves authored content',()=>{
  const notice={type:'author_announcement',message:'Legacy English',message_key:'authorAnnouncement',message_values:{name:'Alice',content:'Mon titre <script>'}};
  for(const [locale,catalog] of [['fr',fr],['de',de]] as const){const t=createTranslator({locale,messages:catalog});const text=notificationText(notice,t,key=>t.has(key),locale);expect(text).toContain('Alice');expect(text).toContain('Mon titre <script>');expect(text).not.toContain('Legacy English');expect(text).not.toContain('posted an announcement');}
});
it('formats tip currencies and milestone numbers without inventing missing amounts',()=>{
  const t=createTranslator({locale:'fr',messages:fr}),format=(message_key:string,message_values:Record<string,unknown>)=>notificationText({type:'tip',message:'English',message_key,message_values},t,key=>t.has(key),'fr');
  expect(format('tipAmount',{amount:'12.50',currency:'NGN'})).toContain(new Intl.NumberFormat('fr',{style:'currency',currency:'NGN',minimumFractionDigits:2,maximumFractionDigits:4}).format(12.5));
  for(const amount of ['',null,'invalid'])expect(format('tipAmount',{amount,currency:'USD'})).toBe(t('notificationMessages.tip'));
  expect(format('readingGoal',{count:2,target:8,percent:25,year:'2026'})).toContain('2026');expect(format('readingGoal',{})).toBe(t('notificationMessages.readingGoalGeneric'));
});
it('translates every fixed badge ID while retaining custom badge names',()=>{
  for(const [locale,catalog] of [['en',en],['fr',fr],['de',de]] as const){const t=createTranslator({locale,messages:catalog});for(const badge of BADGE_DEFINITIONS){expect(t.has(('badgeNames.'+badge.id) as NotificationTextKey)).toBe(true);expect(notificationText({type:'badge_earned',message:'Legacy English',message_key:'badge',message_values:{badgeId:badge.id,badgeName:badge.name}},t,key=>t.has(key),locale)).toContain(t(('badgeNames.'+badge.id) as NotificationTextKey));}
    expect(notificationText({type:'badge_earned',message:'',message_key:'badge',message_values:{badgeId:'custom',badgeName:'Prix personnalisé'}},t,key=>t.has(key),locale)).toContain('Prix personnalisé');
  }
});
