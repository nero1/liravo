import {getArcs} from '@/lib/arcs';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getAuthorCatalog} from '@/lib/author-catalog';
import {decodeCursor} from '@/lib/pagination';
import {createServiceClient} from '@/lib/supabase/server';
import {NextResponse} from 'next/server';
import {profileVisibleTo} from '@/lib/profile-visibility';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:{username:string}}){
  const cursor=new URL(request.url).searchParams.get('cursor');try{decodeCursor(cursor);}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  try{
    const service=createServiceClient(),{data:author,error}=await service.from('users').select('id,username,display_name,bio,avatar_url,banner_url,is_verified_author,xp,user_types,external_links').eq('username',params.username).is('deleted_at',null).eq('is_banned',false).maybeSingle();
    if(error)throw error;
    if(!author||(!author.is_verified_author&&!author.user_types?.includes('author')))return NextResponse.json({error:'Author not found'},{status:404});
    const viewer=await getCurrentUser();
    if(!await profileVisibleTo(author.id,viewer?.id??null))return NextResponse.json({error:'Author not found'},{status:404,headers:{'Cache-Control':'private, no-store'}});
    const [catalog,posts,arcs,followers,following]=await Promise.all([
      getAuthorCatalog(author.id,cursor),
      service.from('author_posts').select('id,title,body,type,book_id,created_at').eq('author_id',author.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(10),
      getArcs(viewer?.id??null,false,null,author.id),
      service.from('follows').select('follower_id',{count:'exact',head:true}).eq('following_id',author.id),
      viewer?service.from('follows').select('follower_id').eq('follower_id',viewer.id).eq('following_id',author.id).maybeSingle():Promise.resolve({data:null,error:null}),
    ]);
    if(posts.error||followers.error||following.error)throw Error('Author data unavailable');
    return NextResponse.json({author:{...author,is_following:!!following.data},...catalog,posts:posts.data??[],arcs:arcs.arcs,arcsNextCursor:arcs.nextCursor,followerCount:followers.count??0},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return NextResponse.json({error:'Author unavailable'},{status:503});}
}
