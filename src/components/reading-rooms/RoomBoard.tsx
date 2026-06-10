'use client';

import { useState, useEffect, useRef } from 'react';
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

export function RoomBoard({ roomId, isCreator, isMember, currentUserId }: Props) {
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
    Promise.all([
      fetch(`/api/reading-rooms/${roomId}/milestones`).then((r) => r.json()),
      fetch(`/api/reading-rooms/${roomId}/posts`).then((r) => r.json()),
    ]).then(([mData, pData]) => {
      setMilestones((mData as { milestones?: Milestone[] }).milestones ?? []);
      setPosts((pData as { posts?: Post[] }).posts ?? []);
    }).finally(() => setLoading(false));
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [posts]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!postContent.trim()) return;
    setPosting(true);
    setPostError('');

    const res = await fetch(`/api/reading-rooms/${roomId}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: postContent.trim(), milestone_id: selectedMilestone }),
    });

    const data = await res.json() as { post?: Post; error?: string };
    if (!res.ok) {
      setPostError(data.error ?? 'Failed to post');
    } else if (data.post) {
      setPosts((prev) => [...prev, data.post!]);
      setPostContent('');
    }
    setPosting(false);
  }

  async function handleAddMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!newMilestoneTitle.trim() || !newMilestoneDate) return;
    setAddingMilestone(true);
    setMilestoneError('');

    const res = await fetch(`/api/reading-rooms/${roomId}/milestones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newMilestoneTitle.trim(), unlock_date: new Date(newMilestoneDate).toISOString() }),
    });

    const data = await res.json() as { milestone?: Milestone; error?: string };
    if (!res.ok) {
      setMilestoneError(data.error ?? 'Failed to add milestone');
    } else if (data.milestone) {
      setMilestones((prev) => [...prev, data.milestone!].sort((a, b) => a.unlock_date.localeCompare(b.unlock_date)));
      setNewMilestoneTitle('');
      setNewMilestoneDate('');
    }
    setAddingMilestone(false);
  }

  async function handleDeleteMilestone(milestoneId: string) {
    await fetch(`/api/reading-rooms/${roomId}/milestones?milestone_id=${milestoneId}`, { method: 'DELETE' });
    setMilestones((prev) => prev.filter((m) => m.id !== milestoneId));
    setPosts((prev) => prev.map((p) => p.milestone_id === milestoneId ? { ...p, milestone_id: null } : p));
  }

  const filteredPosts = selectedMilestone
    ? posts.filter((p) => p.milestone_id === selectedMilestone)
    : posts.filter((p) => !p.milestone_id);

  const canPost = isCreator || isMember;

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-10 bg-muted rounded w-40" />
        <div className="h-32 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {(['discussion', 'milestones'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-accent text-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
            {tab === 'milestones' && milestones.length > 0 && (
              <span className="ml-1 text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded-full">
                {milestones.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'milestones' && (
        <div className="space-y-4">
          {milestones.length === 0 && !isCreator && (
            <p className="text-sm text-muted-foreground">No milestones set for this room.</p>
          )}

          {milestones.map((m) => {
            const unlocked = new Date(m.unlock_date) <= new Date();
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
                        {unlocked ? 'Unlocked' : 'Unlocks'}{' '}
                        {new Date(m.unlock_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
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
                        {mPosts.length} post{mPosts.length !== 1 ? 's' : ''} →
                      </button>
                    )}
                    {isCreator && (
                      <button
                        onClick={() => handleDeleteMilestone(m.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {isCreator && (
            <form onSubmit={handleAddMilestone} className="rounded-xl border border-dashed border-border p-4 space-y-3">
              <p className="font-medium text-sm">Add Milestone</p>
              <input
                type="text"
                placeholder="Chapter name or page range..."
                value={newMilestoneTitle}
                onChange={(e) => setNewMilestoneTitle(e.target.value)}
                maxLength={200}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <input
                type="datetime-local"
                value={newMilestoneDate}
                onChange={(e) => setNewMilestoneDate(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
              {milestoneError && <p className="text-xs text-red-500">{milestoneError}</p>}
              <button
                type="submit"
                disabled={addingMilestone || !newMilestoneTitle.trim() || !newMilestoneDate}
                className="rounded-lg bg-accent text-white text-sm font-medium px-4 py-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {addingMilestone ? 'Adding…' : 'Add Milestone'}
              </button>
            </form>
          )}
        </div>
      )}

      {activeTab === 'discussion' && (
        <div className="space-y-4">
          {/* Milestone filter pills */}
          {milestones.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedMilestone(null)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  !selectedMilestone ? 'bg-accent text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                General
              </button>
              {milestones.filter((m) => new Date(m.unlock_date) <= new Date()).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMilestone(m.id)}
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
                {canPost ? 'No messages yet. Start the conversation!' : 'No messages yet.'}
              </p>
            ) : (
              filteredPosts.map((post) => {
                const isOwn = post.users?.id === currentUserId;
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
                          {post.users?.display_name ?? 'Unknown'}
                        </Link>
                      )}
                      <div className={`rounded-2xl px-3 py-2 text-sm ${
                        isOwn ? 'bg-accent text-white rounded-tr-sm' : 'bg-muted text-foreground rounded-tl-sm'
                      }`}>
                        {post.content}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(post.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        {' · '}
                        {new Date(post.created_at).toLocaleDateString()}
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
                placeholder={selectedMilestone ? 'Discuss this milestone…' : 'Say something…'}
                rows={2}
                maxLength={2000}
                className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
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
                {posting ? '…' : 'Post'}
              </button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">
              Join this room to participate in the discussion.
            </p>
          )}
          {postError && <p className="text-xs text-red-500">{postError}</p>}
        </div>
      )}
    </div>
  );
}
