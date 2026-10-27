// Mirror of src/types/database.ts — kept in sync manually.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  country: string | null;
  user_types: string[];
  genres: string[];
  is_admin: boolean;
  is_premium:boolean;
  preferred_locale:'en'|'fr'|'de';
  is_moderator: boolean;
  is_verified_author: boolean;
  is_creator: boolean;
  is_suspended: boolean;
  is_banned: boolean;
  suspension_reason: string | null;
  xp: number;
  reading_streak: number;
  streak_freeze_tokens: number;
  last_streak_date: string | null;
  annual_reading_goal: number | null;
  books_read_count: number;
  referral_code: string;
  referred_by: string | null;
  email: string | null;
  email_verified: boolean;
  totp_enabled: boolean;
  external_links: string[];
  profile_visibility: 'public' | 'followers_only';
  shelf_visibility: 'public' | 'followers_only' | 'private';
  show_referrer: boolean;
  onboarding_complete: boolean;
  email_prompt_shown_at: string | null;
  email_prompt_dismissed_at: string | null;
  created_at: string;
  updated_at: string;
  badges?: { icon: string; name: string }[];
}

export interface BookRow {
  id: string;
  google_books_id: string | null;
  open_library_id: string | null;
  isbn_10: string | null;
  isbn_13: string | null;
  title: string;
  subtitle: string | null;
  author_name: string;
  author_names: string[];
  publisher: string | null;
  published_year: number | null;
  description: string | null;
  cover_url: string | null;
  page_count: number | null;
  genres: string[];
  language: string;
  has_audiobook: boolean;
  average_rating: number | null;
  ratings_count: number;
  currently_reading_count: number;
  want_to_read_count: number;
  have_read_count: number;
  similar_book_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface ShelfRow {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  is_default: boolean;
  default_type: 'currently_reading' | 'have_read' | 'want_to_read' | null;
  is_public: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShelfBookRow {
  id: string;
  shelf_id: string;
  book_id: string;
  user_id: string;
  progress_pages: number | null;
  progress_percent: number | null;
  started_at: string | null;
  finished_at: string | null;
  edition_read: string | null;
  added_at: string;
  updated_at: string;
  book?: BookRow;
}

export interface ReviewRow {
  id: string;
  user_id: string;
  book_id: string;
  review_type: 'short' | 'long' | 'one_line';
  rating: number;
  content: string | null;
  mood_tags: string[];
  has_spoilers: boolean;
  read_date: string | null;
  edition_read: string | null;
  likes_count: number;
  want_to_read_count: number;
  helpful_votes: number;
  unhelpful_votes: number;
  is_hidden: boolean;
  moderation_status: 'published' | 'pending' | 'removed';
  created_at: string;
  updated_at: string;
  user?: Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  book?: Pick<BookRow, 'id' | 'title' | 'cover_url' | 'author_name'>;
}

export interface QuoteRow {
  id: string;
  user_id: string;
  book_id: string;
  content: string;
  page_number: number | null;
  is_hidden: boolean;
  created_at: string;
  user?: Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  book?: Pick<BookRow, 'id' | 'title' | 'author_name'>;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  actor_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
  actor?: Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
}

export interface FeedItem {
  id: string;
  type: 'review' | 'shelf_add' | 'challenge_join' | 'quote' | 'follow';
  actor: Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  book?: Pick<BookRow, 'id' | 'title' | 'cover_url' | 'author_name'>;
  review?: ReviewRow;
  quote?: QuoteRow;
  created_at: string;
}

export interface BuddyReadRow {
  id: string;
  title: string;
  book_id: string;
  organizer_id: string;
  start_date: string;
  end_date: string | null;
  participant_count: number;
  is_public: boolean;
  created_at: string;
  book?: Pick<BookRow, 'id' | 'title' | 'cover_url' | 'author_name'>;
}

export interface ChallengeRow {
  id: string;
  title: string;
  description: string | null;
  type: 'reading' | 'writing';
  cadence:'weekly'|'monthly';
  start_date: string | null;
  end_date: string | null;
  goal_books:number|null;
  goal_pages:number|null;
  is_active:boolean;
  participant_count?: number;
  created_at: string;
}

export interface ListRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  is_public: boolean;
  book_count: number;
  follower_count: number;
  created_at: string;
  updated_at: string;
  user?: Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
}

export interface WritingPromptRow {
  id: string;
  prompt: string;
  genre: string | null;
  created_at: string;
  submission_count?: number;
}

export interface WritingChallengeRow {
  id: string;
  title: string;
  description: string | null;
  word_limit: number | null;
  deadline: string | null;
  xp_reward: number;
  is_premium: boolean;
  participant_count: number;
  created_at: string;
}

export interface ReadingStatsRow {
  books_read: number;
  pages_read: number;
  reviews_written: number;
  quotes_saved: number;
  current_streak: number;
  longest_streak: number;
  favorite_genres: string[];
  annual_goal: number | null;
  annual_progress: number;
}

export interface LeaderboardEntry {
  rank: number;
  user: Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url' | 'xp' | 'books_read_count'>;
  xp: number;
  books_read: number;
}

export type UserType = 'reader' | 'author' | 'newbie_writer' | 'creator';

export const GENRES = [
  'Literary Fiction', 'Science Fiction', 'Fantasy', 'Mystery', 'Thriller',
  'Romance', 'Horror', 'Historical Fiction', 'Nonfiction', 'Biography',
  'Self-Help', 'Business', 'Science', 'Travel', 'Poetry',
  'Graphic Novel', 'Young Adult', 'Children', 'Cookbooks', 'Art & Photography',
] as const;

export const MOOD_TAGS = [
  'Dark', 'Cozy', 'Mind-bending', 'Funny', 'Emotional',
  'Slow-burn', 'Fast-paced', 'Educational', 'Inspiring',
  'Disturbing', 'Romantic', 'Intense',
] as const;

export const LEVEL_THRESHOLDS = [
  { min: 0, max: 499, title: 'Page Turner' },
  { min: 500, max: 1499, title: 'Bookmarked' },
  { min: 1500, max: 3999, title: 'Chapter Chaser' },
  { min: 4000, max: 7999, title: 'Spine Cracker' },
  { min: 8000, max: 14999, title: 'Literary Nomad' },
  { min: 15000, max: 24999, title: 'Wordsmith' },
  { min: 25000, max: 49999, title: 'Bibliophile' },
  { min: 50000, max: Infinity, title: 'Legend of the Shelf' },
] as const;

export function getUserLevel(xp: number) {
  return LEVEL_THRESHOLDS.find((l) => xp >= l.min && xp <= l.max) ?? LEVEL_THRESHOLDS[0];
}

export interface AffiliateStoreRow {
  id: string;
  name: string;
  countries: string[];
  url_template: string;
  affiliate_tag: string | null;
  is_active: boolean;
  priority: number;
  is_non_affiliate: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeatureFlagRow {
  id: string;
  name: string;
  enabled: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentReportRow {
  id: string;
  reporter_id: string;
  entity_type: 'review' | 'quote' | 'comment' | 'user';
  entity_id: string;
  reason: string;
  status: 'pending' | 'approved' | 'removed' | 'warned' | 'escalated';
  moderator_id: string | null;
  moderator_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface AffiliateLink {
  name:string;
  url:string;
  isAffiliate:boolean;
  isPrimary:boolean;
}
