import {useEffect,useRef,useState} from 'react';
import {Text,TouchableOpacity,View} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {useRouter} from 'expo-router';
import {useTranslations} from '@/hooks/useTranslations';
import {useAuthStore} from '@/stores/auth';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/Button';
import type {BookRow,WorkCatalog} from '@/types';
interface Props {catalog:WorkCatalog;book?:BookRow;}
export function EditionSelector(props:Props){const owner=useAuthStore(state=>state.user?.id);return <OwnedEditionSelector key={(owner??'')+':'+props.catalog.work.id+':'+(props.book?.id??'work')} {...props}/>;}
function OwnedEditionSelector({catalog,book}:Props){
  const queryClient=useQueryClient();
  const {t,locale}=useTranslations('editions'),{t:common}=useTranslations('common'),router=useRouter(),busy=useRef(false),active=useRef(true);
  const [work,setWork]=useState(catalog.work);
  const [editions,setEditions]=useState(()=>book&&!catalog.editions.some(edition=>edition.id===book.id)?[book,...catalog.editions]:catalog.editions);
  const [cursor,setCursor]=useState(catalog.nextCursor),[providerCursor,setProviderCursor]=useState<string|null>(null),[providerComplete,setProviderComplete]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(false),[skipped,setSkipped]=useState(0);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  async function loadMore(){
    if(busy.current)return;busy.current=true;setLoading(true);setError(false);
    try{
      const data=cursor?await api.get<WorkCatalog>('/api/works/'+work.id,{cursor}):await api.post<{work:WorkCatalog['work'];editions:BookRow[];localCursor:string|null;providerCursor:string|null;providerComplete:boolean;skipped:number}>('/api/works/'+work.id+'/editions',{cursor:providerCursor});
      const currentWork=data.work;
      if(!Array.isArray(data.editions)||data.editions.some(edition=>edition.work_id!==currentWork.id||typeof edition.id!=='string'))throw new Error('Invalid editions page');
      if(!active.current)return;
      if('nextCursor' in data&&data.nextCursor===cursor)throw new Error('Repeated editions cursor');
      setWork(currentWork);
      setEditions(previous=>[...new Map([...previous.map(edition=>({...edition,work_id:currentWork.id})),...data.editions].map(edition=>[edition.id,edition])).values()]);
      if('nextCursor' in data)setCursor(data.nextCursor);else{setCursor(data.localCursor);setProviderCursor(data.providerCursor);setProviderComplete(data.providerComplete);setSkipped(data.skipped);}
      if(currentWork.id!==catalog.work.id||currentWork.title!==catalog.work.title||currentWork.open_library_id!==catalog.work.open_library_id){void queryClient.invalidateQueries({queryKey:['work',catalog.work.id]});if(book)void queryClient.invalidateQueries({queryKey:['book',book.id]});}
    }catch{if(active.current)setError(true);}
    finally{busy.current=false;if(active.current)setLoading(false);}
  }
  function description(edition:BookRow){
    let language=edition.language;try{language=new Intl.DisplayNames([locale],{type:'language'}).of(language)??language;}catch{}
    return [language,edition.format?t('formats.'+edition.format):null,edition.edition_name,edition.publisher,edition.published_year].filter(Boolean).join(' · ');
  }
  return <View className="gap-3">
    <Text accessibilityRole="header" className="font-semibold text-foreground">{t('ofWork',{title:work.title})}</Text>
    {book&&<Button variant="ghost" onPress={()=>router.push('/work/'+work.id)}>{t('viewWork')}</Button>}
    <Text className="text-sm text-muted-foreground">{t('trackingHint')}</Text>
    {editions.map(edition=><TouchableOpacity key={edition.id} accessibilityRole="link" accessibilityState={{selected:book?.id===edition.id}} onPress={()=>router.push('/book/'+edition.id)} className="rounded-xl border border-border p-3 gap-1">
      <Text className="font-medium text-foreground">{edition.title}{book?.id===edition.id?' · '+t('selected'):''}</Text>
      <Text className="text-xs text-muted-foreground">{description(edition)}</Text>
      <Text className="text-xs text-muted-foreground">{edition.isbn_13||edition.isbn_10?t('isbn',{value:edition.isbn_13??edition.isbn_10!}):t('noIsbn')}</Text>
    </TouchableOpacity>)}
    {editions.length===0&&<Text className="text-muted-foreground">{t('empty')}</Text>}
    {skipped>0&&<Text accessibilityLiveRegion="polite" className="text-muted-foreground">{t('skipped',{count:skipped})}</Text>}
    {error&&<Text accessibilityRole="alert" className="text-destructive">{t('failed')}</Text>}
    {(cursor||!providerComplete&&(work.open_library_id||editions.some(edition=>edition.isbn_13||edition.isbn_10)))&&<Button loading={loading} variant="outline" onPress={loadMore}>{error?common('retry'):cursor?t('moreSaved'):t('findMore')}</Button>}
  </View>;
}
