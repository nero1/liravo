import {ImageResponse} from 'next/og';
import {getTranslations} from 'next-intl/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const locale=new URL(request.url).searchParams.get('locale')??'en';if(!['en','fr','de'].includes(locale))return new Response('Invalid locale',{status:400});const t=await getTranslations({locale,namespace:'site'});
 return new ImageResponse(<div style={{display:'flex',flexDirection:'column',justifyContent:'center',width:'100%',height:'100%',background:'#0f0f0f',color:'#ffffff',padding:80}}><div style={{fontSize:96,color:'#f59e0b'}}>Liravo</div><div style={{fontSize:40,marginTop:24}}>{t('socialTagline')}</div></div>,{width:1200,height:630,headers:{'Cache-Control':'public, max-age=3600'}});
}
