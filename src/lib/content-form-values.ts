import {readingRoomUnlockDate} from './reading-room-date';
export const MAX_QUOTE_PAGE=2147483647;
export function quotePageNumber(value:string):number|null|undefined{if(!value.trim())return undefined;const number=Number(value);return Number.isSafeInteger(number)&&number>0&&number<=MAX_QUOTE_PAGE?number:null;}
export function validReadDate(value:string){return !value||readingRoomUnlockDate(value+'T00:00')!==null;}
export function validProofUrl(value:string){if(!value.trim())return true;try{return ['https:','http:'].includes(new URL(value.trim()).protocol);}catch{return false;}}
