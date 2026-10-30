import {ImageResponse} from '@vercel/og';
import {getLocale,getTranslations} from 'next-intl/server';
import {z} from 'zod';
import {getReadingDebate,ReadingCatalogError} from '@/lib/reading-discovery';
import {APP_URL} from '@/constants/config';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:{id:string}}){
  if(!z.string().uuid().safeParse(params.id).success)return new Response('Invalid share request',{status:400});
  const locale=z.enum(['en','fr','de']).safeParse(new URL(request.url).searchParams.get('locale')??await getLocale());if(!locale.success)return new Response('Invalid share request',{status:400});
  let debate;try{debate=(await getReadingDebate(null,params.id)).debate;}catch(error){return new Response('Debate unavailable',{status:error instanceof ReadingCatalogError?error.status:503});}
  const t=await getTranslations({locale:locale.data,namespace:'bookDebates'}),total=debate.yes_count+debate.no_count,yes=total?Math.round(debate.yes_count*100/total)/100:0,percent=new Intl.NumberFormat(locale.data,{style:'percent',maximumFractionDigits:0});
  return new ImageResponse(<div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',background:'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',padding:56,fontFamily:'sans-serif',color:'#ffffff'}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:24}}><span style={{fontSize:24,fontWeight:700,color:'#d97706'}}>Liravo</span><span style={{fontSize:18,color:'#cbd5e1'}}>{t('title')}</span></div><h1 style={{display:'flex',alignItems:'center',flex:1,fontSize:debate.question.length>80?32:42,fontWeight:700,lineHeight:1.2,margin:0}}>{debate.question}</h1><p style={{display:'flex',fontSize:16,color:'#cbd5e1',margin:'16px 0 24px'}}>{t('shareBook',{title:debate.book.title,author:debate.book.author_name})}</p><div style={{display:'flex',height:16,borderRadius:8,overflow:'hidden',background:'#475569'}}>{total>0&&<><div style={{display:'flex',width:yes*100+'%',background:'#16a34a'}}/><div style={{display:'flex',width:(1-yes)*100+'%',background:'#dc2626'}}/></>}</div><div style={{display:'flex',justifyContent:'space-between',marginTop:12,fontSize:20,fontWeight:700}}>{total>0?<><span style={{color:'#4ade80'}}>{t('yesCount',{count:debate.yes_count})+' · '+percent.format(yes)}</span><span style={{color:'#f87171'}}>{t('noCount',{count:debate.no_count})+' · '+percent.format(1-yes)}</span></>:<span style={{color:'#cbd5e1'}}>{t('noVotes')}</span>}</div>{!debate.is_active&&<p style={{display:'flex',fontSize:16,color:'#cbd5e1'}}>{t('closed')}</p>}<p style={{display:'flex',fontSize:14,color:'#94a3b8',marginTop:24}}>{APP_URL+'/debates/'+params.id}</p></div>,{width:1200,height:630});
}
