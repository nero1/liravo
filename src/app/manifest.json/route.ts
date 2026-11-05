import {getTranslations} from 'next-intl/server';
import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const locale=new URL(request.url).searchParams.get('locale')??'en';if(!['en','fr','de'].includes(locale))return NextResponse.json({error:'Invalid locale'},{status:400});
 const site=await getTranslations({locale,namespace:'site'}),discover=await getTranslations({locale,namespace:'discover'}),shelves=await getTranslations({locale,namespace:'shelves'});
 return NextResponse.json({id:'/',name:'Liravo',short_name:'Liravo',description:site('description'),lang:locale,dir:'ltr',start_url:'/',scope:'/',display:'standalone',background_color:'#ffffff',theme_color:'#d97706',orientation:'portrait-primary',categories:['books','social','entertainment'],icons:[192,512].map(size=>({src:'/icons/icon-'+size+'.png',sizes:size+'x'+size,type:'image/png',purpose:'any maskable'})),screenshots:[],shortcuts:[{name:discover('title'),url:'/discover',description:discover('searchDescription')},{name:shelves('title'),url:'/shelf',description:shelves('viewDescription')}]},{headers:{'Content-Type':'application/manifest+json; charset=utf-8','Cache-Control':'public, max-age=300'}});
}
