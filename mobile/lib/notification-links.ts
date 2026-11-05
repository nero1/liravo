export function notificationPath(value:unknown):string|null{
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u0020]/.test(value))return null;
 const path=value.split(/[?#]/)[0];
 const tabs:Record<string,string>={'/notifications':'/(tabs)/notifications','/feed':'/(tabs)/feed','/shelf':'/(tabs)/shelf','/discover':'/(tabs)/discover','/profile':'/(tabs)/profile'};
 if(tabs[path])return tabs[path];
 if(/^\/(book|work|lists|arcs|buddy-reads|reading-rooms|debates|events|challenges|write\/(prompts|challenges|workshops))\/[a-f0-9-]{36}$/i.test(path)||/^\/(user|author)\/[\w-]{1,50}$/.test(path))return path;
 return null;
}
