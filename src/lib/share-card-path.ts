export function shareCardPath(kind:string,id:string,locale:string,query:Record<string,string>={}){return'/share/'+kind+'/'+id+'?'+new URLSearchParams({v:'2',locale,...query}).toString();}
