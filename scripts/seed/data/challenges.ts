export interface SeedChallenge {
  title: string;
  description: string;
  type: 'weekly' | 'monthly';
  start_date: string;
  end_date: string;
  is_active: boolean;
}

// Dates relative to June 2026 launch window
export const SEED_CHALLENGES: SeedChallenge[] = [
  // ── Weekly writing challenges (4 weeks) ──────────────────────────────────
  {
    title: 'Flash Fiction Week: 500 Words or Less',
    description: 'Write a complete story — beginning, middle, and end — in 500 words or fewer. Constraints breed creativity. This week, every word must earn its place.',
    type: 'weekly',
    start_date: '2026-06-01T00:00:00Z',
    end_date: '2026-06-07T23:59:59Z',
    is_active: true,
  },
  {
    title: 'First Lines Week',
    description: 'Write seven first lines — one each day. Each line should be a story waiting to happen. Experiment with voice, tense, tone, and genre. At the end of the week, choose your favourite and write the next 300 words.',
    type: 'weekly',
    start_date: '2026-06-08T00:00:00Z',
    end_date: '2026-06-14T23:59:59Z',
    is_active: true,
  },
  {
    title: 'Unreliable Narrator Week',
    description: 'Write a scene from the perspective of a narrator who is hiding something — from the reader, or from themselves. Your narrator believes they are telling the truth. Write so that the reader quietly doubts them.',
    type: 'weekly',
    start_date: '2026-06-15T00:00:00Z',
    end_date: '2026-06-21T23:59:59Z',
    is_active: true,
  },
  {
    title: 'Dialogue-Only Week',
    description: 'Write an entire scene using only dialogue — no action beats, no description, no interiority. The reader should understand the setting, relationship, and conflict purely through what the characters say and how they say it.',
    type: 'weekly',
    start_date: '2026-06-22T00:00:00Z',
    end_date: '2026-06-28T23:59:59Z',
    is_active: true,
  },
  // ── Monthly reading & writing challenges (2 months) ──────────────────────
  {
    title: 'June Reading Challenge: The Genre Swap',
    description: 'Read one book from a genre you\'ve never tried — or always avoided. Literary fiction reader? Pick up a thriller. Fantasy devotee? Try a memoir. Write a short reflection: what surprised you? What techniques can you steal for your own writing?',
    type: 'monthly',
    start_date: '2026-06-01T00:00:00Z',
    end_date: '2026-06-30T23:59:59Z',
    is_active: true,
  },
  {
    title: 'July Writing Challenge: Complete a Short Story',
    description: 'Write and complete a short story of at least 1,500 words by the end of the month. It doesn\'t need to be perfect — it needs to be finished. A story with a beginning, a middle, and an end. Share your word count and a teaser line with the community.',
    type: 'monthly',
    start_date: '2026-07-01T00:00:00Z',
    end_date: '2026-07-31T23:59:59Z',
    is_active: true,
  },
];
