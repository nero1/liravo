'use client';

import { useState, useEffect,useRef,useId } from 'react';
import {useTranslations,useFormatter,useNow} from 'next-intl';
import {useRequestIntent} from '@/lib/client/useRequestIntent';
import Image from 'next/image';
import Link from 'next/link';

interface Milestone {
  id: string;
  title: string;
  unlock_date: string;
}

interface PostAuthor {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

interface Post {
  user_id?:string;
  id: string;
  content: string;
  milestone_id: string | null;
  created_at: string;
  users: PostAuthor | null;
}

interface Props {
  roomId: string;
  isCreator: boolean;
  isMember: boolean;
  currentUserId: string;
}

export function RoomBoard(props:Props){return <OwnedRoomBoard key={props.currentUserId+':'+props.roomId} {...props}/>;}
function OwnedRoomBoard({roomId,isCreator,isMember,currentUserId}:Props){
  const t=useTranslations('roomBoard'),common=useTranslations('common'),formatter=useFormatter(),now=useNow({updateInterval:60000}),intent=useRequestIntent(currentUserId),postBusy=useRef(false),milestoneBusy=useRef(false),deleteBusy=useRef(false),panelId=useId(),[loadError,setLoadError]=useState(false),[revision,setRevision]=useState(0),[deleting,setDeleting]=useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'discussion' | 'milestones'>('discussion');
  const [selectedMilestone, setSelectedMilestone] = useState<string | null>(null);

  const [postContent, setPostContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');

  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('');
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [milestoneError, setMilestoneError] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller=new AbortController();setLoading(true);setLoadError(false);
    const load=async(path:string)=>{const response=await fetch(`/api/reading-rooms/${roomId}/${path}`,{signal:controller.signal});if(!response.ok)throw new Error('Room unavailable');return response.json();};
    void Promise.all([load('milestones'),load('posts')]).then(([mData,pData])=>{
      if(!Array.isArray(mData.milestones)||!Array.isArray(pData.posts))throw new Error('Invalid room data');
      if(!controller.signal.aborted){setMilestones(mData.milestones);setPosts(pData.posts);}
    }).catch(()=>{if(!controller.signal.aborted)setLoadError(true);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[roomId,revision]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [posts]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if(!postContent.trim()||postBusy.current)return;postBusy.current=true;setPosting(true);setPostError('');
    const payload={content:postContent.trim(),milestone_id:selectedMilestone},scope='room-post:'+roomId;
    try{
      const res=await fetch(`/api/reading-rooms/${roomId}/posts`,{method:'POST',headers:{'Content-Type':'application/json',...await intent.durableHeaders(payload,scope)},body:JSON.stringify(payload)}),data=await res.json();
      if(!res.ok||typeof data.post?.id!=='string')throw new Error('Post unavailable');
      intent.complete(scope);setPosts(previous=>previous.some(post=>post.id===data.post.id)?previous:[...previous,data.post]);setPostContent('');
    }catch{setPostError(t('postFailed'));}
    finally{postBusy.current=false;setPosting(false);}
  }

  async function handleAddMilestone(e:React.FormEvent){
    e.preventDefault();if(!newMilestoneTitle.trim()||!newMilestoneDate||milestoneBusy.current)return;
    milestoneBusy.current=true;setAddingMilestone(true);setMilestoneError('');
    const scope='room-milestone:'+roomId;
    try{
      const payload={title:newMilestoneTitle.trim(),unlock_date:new Date(newMilestoneDate).toISOString()};
      const res=await fetch(`/api/reading-rooms/${roomId}/milestones`,{method:'POST',headers:{'Content-Type':'application/json',...await intent.durableHeaders(payload,scope)},body:JSON.stringify(payload)}),data=await res.json();
      if(!res.ok||typeof data.milestone?.id!=='string')throw new Error('Milestone unavailable');
      intent.complete(scope);setMilestones(previous=>previous.some(milestone=>milestone.id===data.milestone.id)?previous:[...previous,data.milestone].sort((a,b)=>a.unlock_date.localeCompare(b.unlock_date)));setNewMilestoneTitle('');setNewMilestoneDate('');
    }catch{setMilestoneError(t('milestoneFailed'));}
    finally{milestoneBusy.current=false;setAddingMilestone(false);}
  }

  async function handleDeleteMilestone(milestoneId:string){
    if(deleteBusy.current)return;deleteBusy.current=true;setDeleting(true);setMilestoneError('');
    try{
      const res=await fetch(`/api/reading-rooms/${roomId}/milestones?milestone_id=${encodeURIComponent(milestoneId)}`,{method:'DELETE'}),data=await res.json();
      if(!res.ok||data.deleted!==true)throw new Error('Milestone deletion unavailable');
      setMilestones(previous=>previous.filter(m=>m.id!==milestoneId));setPosts(previous=>previous.map(post=>post.milestone_id===milestoneId?{...post,milestone_id:null}:post));setSelectedMilestone(previous=>previous===milestoneId?null:previous);
    }catch{setMilestoneError(t('deleteFailed'));}
    finally{deleteBusy.current=false;setDeleting(false);}
  }

  const filteredPosts = selectedMilestone
    ? posts.filter((p) => p.milestone_id === selectedMilestone)
    : posts.filter((p) => !p.milestone_id);

  const canPost = isCreator || isMember;

  if (loading) {
    return (
      <div role="status" aria-label={common('loading')} className="space-y-3 animate-pulse">
        <div className="h-10 bg-muted rounded w-40" />
        <div className="h-32 bg-muted rounded" />
      </div>
    );
  }

  if(loadError)return <div role="alert" className="text-sm text-destructive">{t('loadFailed')} <button onClick={()=>setRevision(value=>value+1)} className="underline">{common('retry')}</button></div>;

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {(['discussion', 'milestones'] as const).map((tab) => (
          <button
            key={tab} aria-pressed={activeTab===tab} aria-controls={panelId+tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-accent text-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(tab)}
            {tab === 'milestones' && milestones.length > 0 && (
              <span className="ml-1 text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded-full">
                {milestones.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'milestones' && (
        <div id={panelId+'milestones'} className="space-y-4">
          {milestones.length === 0 && !isCreator && (
            <p className="text-sm text-muted-foreground">{t('noMilestones')}</p>
          )}

          {milestones.map((m) => {
            const unlocked = new Date(m.unlock_date)<=now;
            const mPosts = posts.filter((p) => p.milestone_id === m.id);
            return (
              <div
                key={m.id}
                className={`rounded-xl border p-4 space-y-2 ${
                  unlocked ? 'border-accent/40 bg-accent/5' : 'border-border bg-muted/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{unlocked ? '🔓' : '🔒'}</span>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{m.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(unlocked?'unlocked':'unlocks',{date:formatter.dateTime(new Date(m.unlock_date),{dateStyle:'medium'})})}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {unlocked && (
                      <button
                        onClick={() => {
                          setSelectedMilestone(m.id);
                          setActiveTab('discussion');
                        }}
                        className="text-xs text-accent hover:underline"
                      >
                        {t('postCount',{count:mPosts.length})} →
                      </button>
                    )}
                    {isCreator && (
                      <button
                        disabled={deleting} onClick={() => handleDeleteMilestone(m.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        {common('delete')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {isCreator && (
            <form onSubmit={handleAddMilestone} className="rounded-xl border border-dashed border-border p-4 space-y-3">
              <p className="font-medium text-sm">{t('addMilestone')}</p>
              <input
                type="text"
                aria-label={t('milestoneTitle')} disabled={addingMilestone} placeholder={t('milestonePlaceholder')}
                value={newMilestoneTitle}
                onChange={(e) => setNewMilestoneTitle(e.target.value)}
                maxLength={200}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <input
                type="datetime-local" aria-label={t('unlockDate')} disabled={addingMilestone}
                value={newMilestoneDate}
                onChange={(e) => setNewMilestoneDate(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />

              <button
                type="submit"
                disabled={addingMilestone || !newMilestoneTitle.trim() || !newMilestoneDate}
                className="rounded-lg bg-accent text-white text-sm font-medium px-4 py-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {addingMilestone?t('adding'):t('addMilestone')}
              </button>
            </form>
          )}
        </div>
      )}

      {milestoneError&&<p role="alert" className="text-xs text-red-500">{milestoneError}</p>}
      {activeTab === 'discussion' && (
        <div id={panelId+'discussion'} className="space-y-4">
          {/* Milestone filter pills */}
          {milestones.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button
                aria-pressed={selectedMilestone===null} onClick={() => setSelectedMilestone(null)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  !selectedMilestone ? 'bg-accent text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {t('general')}
              </button>
              {milestones.filter((m) => new Date(m.unlock_date)<=now).map((m) => (
                <button
                  key={m.id}
                  disabled={posting} aria-pressed={selectedMilestone===m.id} onClick={() => setSelectedMilestone(m.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    selectedMilestone === m.id ? 'bg-accent text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {m.title}
                </button>
              ))}
            </div>
          )}

          {/* Posts */}
          <div className="space-y-3 min-h-[200px] max-h-[600px] overflow-y-auto pr-1">
            {filteredPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {t(canPost?'startConversation':'noMessages')}
              </p>
            ) : (
              filteredPosts.map((post) => {
                const isOwn=post.user_id===currentUserId||post.users?.id===currentUserId;
                return (
                  <div key={post.id} className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
                    <div className="flex-shrink-0">
                      {post.users?.avatar_url ? (
                        <Image
                          src={post.users.avatar_url}
                          alt={post.users.display_name}
                          width={32}
                          height={32}
                          className="rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
                          {(post.users?.display_name ?? '?')[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                      {!isOwn && (
                        <Link href={`/user/${post.users?.username ?? ''}`} className="text-xs text-muted-foreground hover:underline">
                          {post.users?.display_name??t('unknown')}
                        </Link>
                      )}
                      <div className={`rounded-2xl px-3 py-2 text-sm ${
                        isOwn ? 'bg-accent text-white rounded-tr-sm' : 'bg-muted text-foreground rounded-tl-sm'
                      }`}>
                        {post.content}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {formatter.dateTime(new Date(post.created_at),{dateStyle:'medium',timeStyle:'short'})}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Post composer */}
          {canPost ? (
            <form onSubmit={handlePost} className="flex gap-2 items-end">
              <textarea
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                disabled={posting} aria-label={t('message')} placeholder={t(selectedMilestone?'discussMilestone':'saySomething')}
                rows={2}
                maxLength={2000}
                className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
                onKeyDown={(e) => {
                  if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handlePost(e as unknown as React.FormEvent);
                  }
                }}
              />
              <button
                type="submit"
                disabled={posting || !postContent.trim()}
                className="rounded-xl bg-accent text-white px-4 py-2 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {posting?common('submitting'):t('post')}
              </button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">
              {t('joinToDiscuss')}
            </p>
          )}
          {postError && <p role="alert" className="text-xs text-red-500">{postError}</p>}
        </div>
      )}
    </div>
  );
}
