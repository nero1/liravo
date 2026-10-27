'use client';

import { useState, useEffect } from 'react';
import { useTranslations,useFormatter } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';

interface Participant {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface Note {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  reply_to_id?:string|null;
  user?: { display_name: string; username: string; avatar_url: string | null };
}

interface BuddyRead {
  id: string;
  book_id: string;
  max_participants: number;
  current_chapter: number;
  is_active: boolean;
  created_by: string;
}

interface Book {
  id: string;
  title: string;
  author_name: string;
  cover_url: string | null;
}

export default function BuddyReadRoomPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const t=useTranslations('buddyReadRoom'),format=useFormatter();
  const [error,setError]=useState<string|null>(null);
  const [chapter,setChapter]=useState('1');

  const [buddyRead, setBuddyRead] = useState<BuddyRead | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteInput, setNoteInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState('');

  useEffect(() => {
    const controller=new AbortController();
    async function load(){
      setLoading(true);setError(null);setBuddyRead(null);setNotes([]);setParticipants([]);setCurrentUserId(null);
      try{
        const [brRes,notesRes,meRes]=await Promise.all([fetch(`/api/buddy-reads/${id}`,{signal:controller.signal}),fetch(`/api/buddy-reads/${id}/notes`,{signal:controller.signal}),fetch('/api/users/me',{signal:controller.signal})]);
        if(!brRes.ok){if(brRes.status!==404)throw new Error('Room unavailable');setBuddyRead(null);return;}
        const room=await brRes.json() as {buddyRead:BuddyRead;book:Book;participants:Participant[]};
        setBuddyRead(room.buddyRead);setChapter(String(room.buddyRead.current_chapter));setBook(room.book);setParticipants(room.participants);
        if(notesRes.ok){const data=await notesRes.json() as {notes:Note[]};setNotes(data.notes);}else if(notesRes.status!==403)throw new Error('Notes unavailable');
        if(meRes.ok){const data=await meRes.json() as {user?:{id:string};id?:string};setCurrentUserId(data.user?.id??data.id??null);}
      }catch{if(!controller.signal.aborted)setError('unavailable');}
      finally{if(!controller.signal.aborted)setLoading(false);}
    }
    void load();return()=>controller.abort();
  },[id]);

  const isParticipant = currentUserId ? participants.some((p) => p.id === currentUserId) : false;

  function addNote(note:Note){
    const own=participants.find(participant=>participant.id===currentUserId);
    setNotes(previous=>previous.some(item=>item.id===note.id)?previous:[{...note,user:own??note.user},...previous]);
  }
  async function postNote(content:string,replyToId:string|null=null){
    if(!content.trim()||submitting)return;
    setSubmitting(true);setError(null);
    try{
      const response=await fetch(`/api/buddy-reads/${id}/notes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:content.trim(),reply_to_id:replyToId})});
      if(!response.ok)throw new Error('Note unavailable');
      const data=await response.json() as {note:Note};addNote(data.note);
      setNoteInput('');setReplyInput('');setReplyingTo(null);
    }catch{setError('failed');}finally{setSubmitting(false);}
  }
  async function updateProgress(event:React.FormEvent){
    event.preventDefault();if(submitting)return;setSubmitting(true);setError(null);
    try{
      const response=await fetch(`/api/buddy-reads/${id}/update`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({current_chapter:Number(chapter),...(noteInput.trim()?{note:noteInput.trim()}:{})})});
      if(!response.ok)throw new Error('Progress unavailable');
      const data=await response.json() as {current_chapter:number;note:Note|null};
      setBuddyRead(previous=>previous?{...previous,current_chapter:data.current_chapter}:previous);
      if(data.note){addNote(data.note);setNoteInput('');}
    }catch{setError('failed');}finally{setSubmitting(false);}
  }
  async function joinBuddyRead(){
    if(submitting)return;setSubmitting(true);setError(null);
    try{const response=await fetch(`/api/buddy-reads/${id}/join`,{method:'POST'});if(!response.ok)throw new Error('Join unavailable');window.location.reload();}
    catch{setError('failed');setSubmitting(false);}
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 animate-pulse space-y-4">
        <div className="h-24 bg-muted rounded-xl" />
        <div className="h-32 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!buddyRead) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center text-muted-foreground">
        <p role={error?'alert':undefined}>{t(error?'unavailable':'notFound')}</p>
        <Link href="/buddy-reads" className="text-accent hover:underline text-sm mt-2 inline-block">{t('back')}</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <Link href="/buddy-reads" className="text-sm text-muted-foreground hover:text-foreground">
        {t('back')}
      </Link>

      {error&&<p role="alert" className="text-sm text-red-600">{t(error)}</p>}
      {/* Book info */}
      <div className="flex items-start gap-4">
        {book?.cover_url && (
          <div className="relative w-16 h-24 flex-shrink-0">
            <Image src={book.cover_url} alt={book.title} fill className="object-cover rounded-md" sizes="64px" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold">{book?.title ?? t('title')}</h1>
          {book && <p className="text-muted-foreground text-sm">{book.author_name}</p>}
          <div className="flex items-center gap-3 mt-2 text-sm flex-wrap">
            <span className="text-muted-foreground">
              {t('chapter',{chapter:buddyRead.current_chapter})}
            </span>
            <span className="text-muted-foreground">
              {t('capacity',{count:participants.length,maximum:buddyRead.max_participants})}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${buddyRead.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-muted text-muted-foreground'}`}>
              {buddyRead.is_active ? t('active') : t('ended')}
            </span>
          </div>
        </div>
      </div>

      {/* Participants */}
      <section>
        <h2 className="font-semibold text-lg mb-3">{t('readers')}</h2>
        <div className="flex gap-2 flex-wrap">
          {participants.map((p) => (
            <Link
              key={p.id}
              href={`/user/${p.username}`}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:border-accent transition-colors text-sm"
            >
              {p.avatar_url ? (
                <Image src={p.avatar_url} alt={p.display_name} width={20} height={20} className="rounded-full object-cover" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-accent text-[10px] font-bold">
                  {p.display_name[0]}
                </div>
              )}
              <span>{p.display_name}</span>
              {p.id === currentUserId && <span className="text-xs text-muted-foreground">{t('you')}</span>}
            </Link>
          ))}
        </div>
      </section>

      {isParticipant&&buddyRead.is_active&&<form onSubmit={updateProgress} aria-busy={submitting} className="flex items-end gap-2">
        <label className="text-sm space-y-1" htmlFor="buddy-chapter"><span>{t('chapterLabel')}</span><input id="buddy-chapter" disabled={submitting} type="number" min={1} max={100000} required value={chapter} onChange={event=>setChapter(event.target.value)} className="block w-28 rounded-lg border border-border bg-background px-3 py-2"/></label>
        <button disabled={submitting} className="px-3 py-2 rounded-lg bg-accent text-white text-sm disabled:opacity-50">{t('save')}</button>
      </form>}
      {/* Discussion */}
      <section>
        <h2 className="font-semibold text-lg mb-3">{t('discussion')}</h2>

        {isParticipant && buddyRead.is_active && (
          <div className="mb-4 flex gap-2">
            <textarea
              rows={2}
              disabled={submitting}
              aria-label={t('thought')}
              maxLength={2000}
              placeholder={t('thought')}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { postNote(noteInput); } }}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              onClick={() => postNote(noteInput)}
              disabled={submitting || !noteInput.trim()}
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 self-end"
            >
              {t('post')}
            </button>
          </div>
        )}

        {notes.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} id={`note-${note.id}`} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {note.user?.avatar_url ? (
                      <Image src={note.user.avatar_url} alt={note.user.display_name} width={24} height={24} className="rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold">
                        {(note.user?.display_name ?? '?')[0].toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium">
                      {note.user?.display_name ?? t('unknown')}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format.dateTime(new Date(note.created_at),{month:'short',day:'numeric'})}
                  </span>
                </div>
                {note.reply_to_id&&<a href={`#note-${note.reply_to_id}`} className="text-xs text-muted-foreground underline">{t('replyTo',{name:notes.find(parent=>parent.id===note.reply_to_id)?.user?.display_name??t('unknown')})}</a>}
                <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                {isParticipant && buddyRead.is_active && (
                  <button
                    disabled={submitting}
                    onClick={() => setReplyingTo(replyingTo === note.id ? null : note.id)}
                    className="mt-2 text-xs text-muted-foreground hover:text-accent transition-colors"
                  >
                    {t('reply')}
                  </button>
                )}
                {replyingTo === note.id && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      disabled={submitting}
                      aria-label={t('replyPlaceholder')} maxLength={2000} placeholder={t('replyPlaceholder')}
                      value={replyInput}
                      onChange={(e) => setReplyInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { postNote(replyInput, note.id); } }}
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                      autoFocus
                    />
                    <button
                      onClick={() => postNote(replyInput, note.id)}
                      disabled={submitting || !replyInput.trim()}
                      className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold disabled:opacity-50"
                    >
                      {t('reply')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {!isParticipant && buddyRead.is_active && participants.length < buddyRead.max_participants && (
        <div className="text-center pt-4">
          <button
            disabled={submitting}
            onClick={joinBuddyRead}
            className="px-6 py-2.5 rounded-lg bg-accent text-white font-semibold hover:opacity-90 transition-opacity"
          >
            {t('join')}
          </button>
        </div>
      )}
    </div>
  );
}
