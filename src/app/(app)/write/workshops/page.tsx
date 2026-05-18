import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Workshop Rooms — Liravo' };

interface WorkshopRoom {
  id: string;
  name: string;
  topic: string | null;
  max_members: number;
  member_count: number;
  facilitator_id: string;
  is_active: boolean;
  created_at: string;
  facilitator: { display_name: string; username: string } | null;
}

export default async function WorkshopsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rooms } = await supabase
    .from('workshop_rooms')
    .select('*, facilitator:facilitator_id(display_name, username)')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Workshop Rooms</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Small-group critique sessions (3–8 members). Get and give feedback.
          </p>
        </div>
        <Link href="/write" className="text-sm text-muted-foreground hover:text-foreground">
          ← Write Hub
        </Link>
      </div>

      <div className="mb-6">
        <CreateRoomForm />
      </div>

      {(rooms ?? []).length === 0 ? (
        <div className="rounded-xl border bg-muted p-8 text-center">
          <p className="text-muted-foreground">No workshop rooms yet. Create one above!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(rooms ?? []).map((room: WorkshopRoom) => (
            <div key={room.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold">{room.name}</h2>
                  {room.topic && (
                    <p className="text-sm text-muted-foreground mt-0.5">{room.topic}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>
                      {room.member_count}/{room.max_members} members
                    </span>
                    {room.facilitator && (
                      <span>
                        Facilitator:{' '}
                        <Link
                          href={`/profile/${room.facilitator.username}`}
                          className="hover:underline"
                        >
                          {room.facilitator.display_name}
                        </Link>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Link
                    href={`/write/workshops/${room.id}`}
                    className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted transition-colors text-center"
                  >
                    View
                  </Link>
                  {room.member_count < room.max_members && (
                    <JoinRoomButton roomId={room.id} />
                  )}
                  {room.member_count >= room.max_members && (
                    <span className="text-xs text-muted-foreground text-center">Full</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateRoomForm() {
  return (
    <details className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer text-sm font-medium">+ Create a Workshop Room</summary>
      <form
        action={async (formData: FormData) => {
          'use server';
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) return;
          const name = formData.get('name') as string;
          const topic = formData.get('topic') as string;
          const max_members = Math.min(8, Math.max(3, parseInt(formData.get('max_members') as string, 10) || 5));
          await supabase.from('workshop_rooms').insert({
            name,
            topic: topic || null,
            max_members,
            facilitator_id: user.id,
            member_count: 1,
            is_active: true,
          });
        }}
        className="mt-4 space-y-3"
      >
        <input
          name="name"
          required
          maxLength={100}
          placeholder="Room name"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <input
          name="topic"
          maxLength={200}
          placeholder="Topic or book (optional)"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <div className="flex items-center gap-2">
          <label className="text-sm" htmlFor="max_members">
            Max members (3–8):
          </label>
          <input
            id="max_members"
            name="max_members"
            type="number"
            min={3}
            max={8}
            defaultValue={5}
            className="w-20 rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          Create Room
        </button>
      </form>
    </details>
  );
}

function JoinRoomButton({ roomId }: { roomId: string }) {
  return (
    <form
      action={async () => {
        'use server';
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: room } = await supabase
          .from('workshop_rooms')
          .select('id, max_members, member_count')
          .eq('id', roomId)
          .single();

        if (!room || (room.member_count ?? 0) >= (room.max_members ?? 8)) return;

        const { data: existing } = await supabase
          .from('workshop_members')
          .select('id')
          .eq('user_id', user.id)
          .eq('room_id', roomId)
          .maybeSingle();

        if (existing) return;

        await supabase
          .from('workshop_members')
          .insert({ user_id: user.id, room_id: roomId });

        await supabase
          .from('workshop_rooms')
          .update({ member_count: (room.member_count ?? 0) + 1 })
          .eq('id', roomId);
      }}
    >
      <button
        type="submit"
        className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-3 py-1.5 transition-colors w-full"
      >
        Join
      </button>
    </form>
  );
}
