export function readingRoomUnlockDate(value:string):string|null{
  const input=value.trim();if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input))return null;
  const date=new Date(input+'Z');if(!Number.isFinite(date.getTime())||date.getUTCFullYear()<1)return null;
  const iso=date.toISOString();return iso.slice(0,16)===input?iso:null;
}
