'use client';

import { useState,useEffect,useRef,useId } from 'react';
import { Info, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import {useTranslations} from 'next-intl';
import {useRequestIntent} from '@/lib/client/useRequestIntent';

interface Note {
  id: string;
  note: string;
  created_at: string;
}

interface CommunityNoteProps {
  contentType: 'review' | 'quote' | 'profile' | 'debate';
  contentId: string;
  userId:string;
  canContribute?: boolean;
}

export function CommunityNote(props:CommunityNoteProps){return <OwnedCommunityNote key={props.userId+':'+props.contentType+':'+props.contentId} {...props}/>;}
function OwnedCommunityNote({contentType,contentId,userId,canContribute=false}:CommunityNoteProps){
  const t=useTranslations('communityNotes'),common=useTranslations('common'),intent=useRequestIntent(userId),busy=useRef(false),panelId=useId(),[loading,setLoading]=useState(false),[loadError,setLoadError]=useState(false),[revision,setRevision]=useState(0);
  const [notes, setNotes] = useState<Note[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    const controller=new AbortController();setLoading(true);setLoadError(false);
    void fetch(`/api/moderation/community-notes?contentType=${contentType}&contentId=${contentId}`,{signal:controller.signal}).then(async response=>{
      const data=await response.json();if(!response.ok||!Array.isArray(data.notes))throw new Error('Notes unavailable');
      if(!controller.signal.aborted)setNotes(data.notes);
    }).catch(()=>{if(!controller.signal.aborted)setLoadError(true);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[loaded,contentType,contentId,revision]);

  function handleToggle() {
    if (!loaded) setLoaded(true);
    setExpanded((prev) => !prev);
  }

  async function handleSubmitNote(e: React.FormEvent) {
    e.preventDefault();
    if(noteText.trim().length<10||busy.current)return;
    busy.current=true;setSubmitting(true);setSubmitError(null);
    const payload={content_type:contentType,content_id:contentId,note:noteText.trim()},scope='community-note:'+contentType+':'+contentId;
    try{
      const res=await fetch('/api/moderation/community-notes',{method:'POST',headers:{'Content-Type':'application/json',...await intent.durableHeaders(payload,scope)},body:JSON.stringify(payload)});
      const data=await res.json();if(!res.ok||typeof data.note?.id!=='string'){setSubmitError(t(res.status===403?'ineligible':'submitFailed'));return;}
      intent.complete(scope);setSubmitted(true);setAdding(false);setNoteText('');
    }catch{setSubmitError(t('submitFailed'));}
    finally{busy.current=false;setSubmitting(false);}
  }


  return (
    <div className="mt-2">
      <button
        onClick={handleToggle} aria-expanded={expanded} aria-controls={panelId}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Info size={14} />
        <span>{t('title')}{notes.length>0?` (${notes.length})`:''}</span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      <div id={panelId} hidden={!expanded} className="mt-2">
        {loading&&<p role="status" className="text-xs text-muted-foreground">{common('loading')}</p>}
        {loadError&&<p role="alert" className="text-xs text-destructive">{t('loadFailed')} <button onClick={()=>setRevision(value=>value+1)}>{common('retry')}</button></p>}
        {notes.length===0&&!submitted&&!loading&&!loadError? (
          <p className="text-xs text-muted-foreground italic">{t('empty')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {notes.length > 0 && (
              <p className="text-xs text-muted-foreground font-medium">{t('reviewers')}</p>
            )}
            {notes.map((note) => (
              <div key={note.id} className="text-xs bg-muted/50 border border-border rounded-md px-3 py-2">
                {note.note}
              </div>
            ))}
            {submitted && (
              <p role="status" className="text-xs text-green-600 font-medium">{t('submitted')}</p>
            )}
          </div>
        )}

        {canContribute && !submitted && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-accent transition-colors"
          >
            <Plus size={12} />
            {t('add')}
          </button>
        )}

        {adding && (
          <form onSubmit={handleSubmitNote} className="mt-2 flex flex-col gap-2">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              minLength={10}
              maxLength={500}
              rows={3}
              placeholder={t('placeholder')} aria-label={t('text')} disabled={submitting}
              className="w-full text-xs rounded-md border border-border bg-background px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {submitError && <p role="alert" className="text-xs text-red-500">{submitError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || noteText.trim().length < 10}
                className="text-xs bg-accent text-white px-3 py-1 rounded-md disabled:opacity-50"
              >
                {submitting?common('submitting'):t('submit')}
              </button>
              <button
                type="button" disabled={submitting}
                onClick={() => { setAdding(false); setNoteText(''); setSubmitError(null); }}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
              >
                {common('cancel')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
