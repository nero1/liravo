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
  pin_hash: string | null;
  totp_secret: string | null;
  totp_enabled: boolean;
  recovery_codes: string[] | null;
  external_links: string[];
  profile_visibility: 'public' | 'followers_only';
  shelf_visibility: 'public' | 'followers_only' | 'private';
  show_referrer: boolean;
  onboarding_complete: boolean;
  email_prompt_shown_at: string | null;
  email_prompt_dismissed_at: string | null;
  created_at: string;
  updated_at: string;
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
  search_vector: string | null;
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
}

export interface QuoteRow {
  id: string;
  user_id: string;
  book_id: string;
  content: string;
  page_number: number | null;
  is_hidden: boolean;
  created_at: string;
}

export interface FollowRow {
  follower_id: string;
  following_id: string;
  created_at: string;
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
}

export interface FeatureFlagRow {
  id: string;
  name: string;
  enabled: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
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

export interface AffiliateLinkClickRow {
  id: string;
  book_id: string;
  user_id_hash: string | null;
  link_type: string;
  store_name: string | null;
  country: string | null;
  is_affiliate: boolean;
  created_at: string;
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

export interface SecurityEventRow {
  id: string;
  user_id: string | null;
  event_type: string;
  ip_hash: string | null;
  auth_provider: string | null;
  metadata: Json | null;
  created_at: string;
}

type NoRelationships = { Relationships: [] };

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: Partial<UserRow> & { id: string; username: string; display_name: string; referral_code: string };
        Update: Partial<UserRow>;
      } & NoRelationships;
      books: {
        Row: BookRow;
        Insert: Partial<BookRow> & { title: string; author_name: string };
        Update: Partial<BookRow>;
      } & NoRelationships;
      shelves: {
        Row: ShelfRow;
        Insert: Partial<ShelfRow> & { user_id: string; name: string; slug: string };
        Update: Partial<ShelfRow>;
      } & NoRelationships;
      shelf_books: {
        Row: ShelfBookRow;
        Insert: Partial<ShelfBookRow> & { shelf_id: string; book_id: string; user_id: string };
        Update: Partial<ShelfBookRow>;
      } & NoRelationships;
      reviews: {
        Row: ReviewRow;
        Insert: Partial<ReviewRow> & { user_id: string; book_id: string; rating: number };
        Update: Partial<ReviewRow>;
      } & NoRelationships;
      quotes: {
        Row: QuoteRow;
        Insert: Partial<QuoteRow> & { user_id: string; book_id: string; content: string };
        Update: Partial<QuoteRow>;
      } & NoRelationships;
      follows: {
        Row: FollowRow;
        Insert: { follower_id: string; following_id: string };
        Update: never;
      } & NoRelationships;
      notifications: {
        Row: NotificationRow;
        Insert: Partial<NotificationRow> & { user_id: string; type: string; message: string };
        Update: Partial<NotificationRow>;
      } & NoRelationships;
      feature_flags: {
        Row: FeatureFlagRow;
        Insert: Partial<FeatureFlagRow> & { name: string };
        Update: Partial<FeatureFlagRow>;
      } & NoRelationships;
      affiliate_stores: {
        Row: AffiliateStoreRow;
        Insert: Partial<AffiliateStoreRow> & { name: string; url_template: string };
        Update: Partial<AffiliateStoreRow>;
      } & NoRelationships;
      affiliate_link_clicks: {
        Row: AffiliateLinkClickRow;
        Insert: Partial<AffiliateLinkClickRow> & { book_id: string; link_type: string };
        Update: never;
      } & NoRelationships;
      content_reports: {
        Row: ContentReportRow;
        Insert: Partial<ContentReportRow> & { reporter_id: string; entity_type: 'review' | 'quote' | 'comment' | 'user'; entity_id: string; reason: string };
        Update: Partial<ContentReportRow>;
      } & NoRelationships;
      security_events: {
        Row: SecurityEventRow;
        Insert: Partial<SecurityEventRow> & { event_type: string };
        Update: never;
      } & NoRelationships;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
