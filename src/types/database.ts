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
  is_premium: boolean;
  preferred_locale: 'en' | 'fr' | 'de';
  is_moderator: boolean;
  is_verified_author: boolean;
  is_creator: boolean;
  is_suspended: boolean;
  is_banned: boolean;
  suspension_reason: string | null;
  xp: number;
  reading_streak: number;
  max_reading_streak:number;
  streak_freeze_tokens: number;
  last_streak_date: string | null;
  annual_reading_goal: number | null;
  books_read_count: number;
  referral_code: string;
  referred_by: string | null;
  email: string | null;
  email_verified: boolean;
  email_digest_enabled:boolean;
  notify_follows:boolean;
  notify_likes:boolean;
  notify_replies:boolean;
  notify_mentions:boolean;
  notify_author_announcements:boolean;
  notify_new_releases:boolean;
  notify_challenge_completions:boolean;
  notify_arc_grants:boolean;
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
  // Virtual: populated by pages that join user_badges
  badges?: Array<{id?:string;icon:string;name:string}>;
}

export interface BookWorkRow {
  id:string;
  title:string;
  author_name:string;
  open_library_id:string|null;
  merged_into:string|null;
  created_at:string;
}
export interface WorkCatalog {
  work:BookWorkRow;
  editions:BookRow[];
  nextCursor:string|null;
  statistics:{ratings_count:number;average_rating:number|null;readers_count:number};
}
export interface BookRow {
  id: string;
  work_id:string;
  canonical_edition_id:string|null;
  metadata_source:'legacy'|'seed'|'goodreads'|'google'|'openlibrary';
  metadata_provenance:Record<string,string>;
  edition_name:string|null;
  format:'hardcover'|'paperback'|'ebook'|'audiobook'|null;
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
  message_key:string|null;
  message_values:Record<string,string|number|null>;
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
      book_works: {Row:BookWorkRow;Insert:Partial<BookWorkRow>&{title:string;author_name:string};Update:Partial<BookWorkRow>} & NoRelationships;
      book_edition_identifiers: {Row:{provider:string;identifier:string;book_id:string};Insert:{provider:string;identifier:string;book_id:string};Update:never} & NoRelationships;
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
      } & { Relationships: [{ foreignKeyName: 'shelf_books_book_id_fkey'; columns: ['book_id']; isOneToOne: false; referencedRelation: 'books'; referencedColumns: ['id'] }, { foreignKeyName: 'shelf_books_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] }, { foreignKeyName: 'shelf_books_shelf_id_fkey'; columns: ['shelf_id']; isOneToOne: false; referencedRelation: 'shelves'; referencedColumns: ['id'] }] };
      reviews: {
        Row: ReviewRow;
        Insert: Partial<ReviewRow> & { user_id: string; book_id: string; rating: number };
        Update: Partial<ReviewRow>;
      } & { Relationships: [{ foreignKeyName: 'reviews_book_id_fkey'; columns: ['book_id']; isOneToOne: false; referencedRelation: 'books'; referencedColumns: ['id'] }, { foreignKeyName: 'reviews_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] }] };
      quotes: {
        Row: QuoteRow;
        Insert: Partial<QuoteRow> & { user_id: string; book_id: string; content: string };
        Update: Partial<QuoteRow>;
      } & { Relationships: [{ foreignKeyName: 'quotes_book_id_fkey'; columns: ['book_id']; isOneToOne: false; referencedRelation: 'books'; referencedColumns: ['id'] }, { foreignKeyName: 'quotes_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] }] };
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

export interface ReviewStatistics {ratings_count:number;average_rating:number|null;distribution:Record<1|2|3|4|5,number>;}
export interface BookReviewPage {
  bookId:string;
  reviews:(Pick<ReviewRow,'id'|'book_id'|'user_id'|'rating'|'content'|'review_type'|'mood_tags'|'has_spoilers'|'likes_count'|'helpful_votes'|'unhelpful_votes'|'created_at'>&{user:Pick<UserRow,'id'|'display_name'|'avatar_url'|'username'>})[];
  statistics:ReviewStatistics;
  nextCursor:string|null;
}

export type QuestionFilter='all'|'unanswered'|'most_answered';
export interface Writer {id:string;username:string;display_name:string;avatar_url:string|null;is_verified_author:boolean;}
export interface WriterQuestion {id:string;user_id:string;question:string;tags:string[];answer_count:number;created_at:string;author:Writer;}
export interface WriterAnswer {id:string;question_id:string;user_id:string;answer:string;created_at:string;author:Writer;}
export interface WriterThread {question:WriterQuestion;bestAnswer:WriterAnswer|null;answers:WriterAnswer[];actorId:string|null;isOwner:boolean;canAnswer:boolean;nextCursor:string|null;}

export type ArcApplicationStatus='pending'|'approved'|'rejected';
export interface ArcOffer {
  id:string;author_id:string;book_id:string;title:string;description:string;reader_slots:number;close_date:string|null;is_active:boolean;created_at:string;
  books:{id:string;title:string;author_name:string;cover_url:string|null;isbn_13:string|null;language:string;format:string|null};
  author:{id:string;display_name:string;username:string;avatar_url:string|null;is_verified_author:boolean};
  approved_count:number;pending_count:number|null;total_applications:number|null;slots_remaining:number;my_application_status:ArcApplicationStatus|null;is_open:boolean;can_apply:boolean;can_review:boolean;
}
export interface ArcApplication {id:string;arc_id:string;reader_id:string;status:ArcApplicationStatus;applied_at:string;reviewed_at:string|null;reader:{id:string;display_name:string;username:string;avatar_url:string|null;xp:number;active:boolean};}
export interface ArcApplications {arc:ArcOffer;applications:ArcApplication[];statistics:{total:number;pending:number;approved:number;rejected:number};nextCursor:string|null;actorId:string;}

export interface BuddyReadRow {
  id:string;title:string|null;book_id:string;created_by:string;created_at:string;
  max_participants:number;current_chapter:number;is_active:boolean;is_private:boolean;
  participant_count:number;is_member:boolean;can_join:boolean;can_update:boolean;
  book:Pick<BookRow,'id'|'title'|'author_name'|'cover_url'|'isbn_13'|'isbn_10'|'language'|'format'>;
}
export interface BuddyReadDetail {
  actorId:string;buddyRead:BuddyReadRow;book:BuddyReadRow['book'];
  participants:Pick<UserRow,'id'|'username'|'display_name'|'avatar_url'>[];
}
export interface BuddyNote {
  id:string;user_id:string;content:string;created_at:string;reply_to_id:string|null;
  user?:Pick<UserRow,'username'|'display_name'|'avatar_url'>;
}
export interface BuddyReadPage {actorId:string;buddy_reads:BuddyReadRow[];nextCursor:string|null;}
export interface BuddyNotePage {actorId:string;roomId:string;notes:BuddyNote[];nextCursor:string|null;}

export interface ReadingStatsRow {
  year:number;booksReadThisYear:number;pagesReadThisYear:number;averageRating:number;readingPace:number;
  favouriteGenre:string|null;longestBook:{title:string;page_count:number}|null;
  readingStreakMax:number;currentReadingStreak:number;reviewsWrittenThisYear:number;quotesSavedThisYear:number;
  goal:{goal:{target_books:number}|null;progress:{books_read:number;year:number;percentage:number|null}};
}
export interface PublicReadingYear {userId:string;displayName:string;year:number;booksRead:number;pagesRead:number;topGenres:string[];}
export interface WrappedData extends PublicReadingYear {
  topMood:string|null;streakMax:number;badgesEarned:number;totalXp:number;yearXp:number;
  favouriteAuthor:string|null;longestBook:{title:string;pageCount:number}|null;shortestBook:{title:string;pageCount:number}|null;
  mostActiveMonthNumber:number|null;mostActiveMonth:string|null;readerTitle:string;readerLevel:number;publicSummary:PublicReadingYear;
}

export interface ReadingRoom {
  id:string;name:string;book_id:string|null;created_by:string;created_at:string;is_active:boolean;is_public:boolean;
  member_count:number;is_member:boolean;can_join:boolean;can_post:boolean;can_manage:boolean;
  book:Pick<BookRow,'id'|'title'|'author_name'|'cover_url'|'isbn_13'|'language'|'format'>|null;
}
export interface RoomParticipant extends Pick<UserRow,'id'|'username'|'display_name'|'avatar_url'> {joined_at:string;}
export interface RoomMilestone {id:string;room_id:string;created_by:string|null;title:string;unlock_date:string;created_at:string;is_unlocked:boolean;post_count:number;}
export interface RoomPost {id:string;user_id:string;room_id:string;content:string;milestone_id:string|null;created_at:string;users:Pick<UserRow,'id'|'username'|'display_name'|'avatar_url'>;}
export interface ReadingRoomPage {actorId:string;rooms:ReadingRoom[];nextCursor:string|null;}
export interface ReadingRoomDetail {actorId:string;room:ReadingRoom;participants:RoomParticipant[];participantsNextCursor:string|null;}
export interface RoomMilestonePage {actorId:string;roomId:string;milestones:RoomMilestone[];nextCursor:string|null;serverNow:string;total:number;}
export interface RoomPostPage {actorId:string;roomId:string;posts:RoomPost[];nextCursor:string|null;}

export interface ReadingList {
  id:string;user_id:string;name:string;description:string|null;is_public:boolean;created_at:string;updated_at:string;
  book_count:number;follower_count:number;is_following:boolean;
}
export interface ReadingListBook {
  id:string;title:string;author_name:string;cover_url:string|null;isbn_10:string|null;isbn_13:string|null;language:string;format:BookRow['format'];added_at:string;
}
export interface ReadingListPage {lists:ReadingList[];nextCursor:string|null;actorId:string;}
export interface ReadingListDetail {list:ReadingList;books:ReadingListBook[];nextCursor:string|null;actorId:string|null;bulkSearchUrl:string|null;}

export interface AppealAction {id:string;content_type:'review'|'quote'|'profile';status:'removed'|'warned'|'approved';created_at:string;label:string|null;moderator_note:string|null;content:string|null;pending_appeal_id:string|null;}
export interface AppealRow {id:string;user_id:string;report_id:string|null;reason:string;content_type:string|null;status:'pending'|'approved'|'rejected';created_at:string;reviewer_note:string|null;reviewed_at:string|null;user:{username:string;display_name:string};action:AppealAction|null;can_review:boolean;}
export interface AppealPage {appeals:AppealRow[];nextCursor:string|null;actorId:string;}
export interface AppealActionPage {actions:AppealAction[];nextCursor:string|null;actorId:string;}

export type LeaderboardType='global'|'national'|'friends'|'reviewers';
export type LeaderboardPeriod='weekly'|'monthly'|'alltime';
export interface LeaderboardEntry {rank:number;id:string;username:string;display_name:string;avatar_url:string|null;xp:number;lifetime_xp:number;level_title:string;level_min:number;helpful_votes:number;review_count:number;}
export interface LeaderboardPage {leaderboard:LeaderboardEntry[];type:LeaderboardType;period:LeaderboardPeriod;periodStart:string|null;periodEnd:string|null;country:string|null;generatedAt:string;actorId:string|null;limit:number;}

export type ReadingEdition=Pick<BookRow,'id'|'title'|'author_name'|'cover_url'|'isbn_10'|'isbn_13'|'language'|'format'>;
export interface ReadingQuote {id:string;user_id:string;book_id:string;content:string;page_number:number|null;created_at:string;books:ReadingEdition;users:{username:string;display_name:string;avatar_url:string|null};}
export interface ReadingQuotePage {quotes:ReadingQuote[];total:number;nextCursor:string|null;actorId:string;}
export interface ReadingDebate {id:string;book_id:string;user_id:string;question:string;yes_count:number;no_count:number;is_active:boolean;created_at:string;current_vote:'yes'|'no'|null;can_vote:boolean;can_share:boolean;book:ReadingEdition;}
export interface ReadingDebatePage {debates:ReadingDebate[];nextCursor:string|null;actorId:string|null;}
export interface DebateVoteReceipt {actorId:string;debateId:string;success:true;vote:'yes'|'no';yes_count:number|null;no_count:number|null;alreadyVoted?:boolean;}
export interface ReadingChallenge {id:string;title:string;description:string|null;type:'reading'|'writing';cadence:'weekly'|'monthly';start_date:string|null;end_date:string|null;goal_books:number|null;goal_pages:number|null;is_active:boolean;created_at:string;participant_count:number;joined:boolean;can_join:boolean;}
export interface ReadingChallengeProgress {booksFinished:number;pagesRead:number;goalBooks:number|null;goalPages:number|null;booksPercent:number|null;pagesPercent:number|null;}
export interface ReadingChallengePage {challenges:ReadingChallenge[];nextCursor:string|null;actorId:string;}
export interface ReadingChallengeDetail {challenge:ReadingChallenge;joined:boolean;joinedAt?:string;progress:ReadingChallengeProgress|null;participants:{id:string;username:string;display_name:string;avatar_url:string|null;joined_at:string}[];participantsNextCursor:string|null;actorId:string;}

export type ModerationAction='approve'|'remove'|'warn'|'escalate';
export interface ModerationPerson {username:string;display_name:string;}
export interface ModerationReport extends ContentReportRow {reporter:ModerationPerson;moderator:ModerationPerson|null;target:{owner_id:string|null;username:string|null;display_name:string|null;label:string|null;content:string|null};allowed_actions:ModerationAction[];}
export interface ModerationLog {id:string;moderator_id:string|null;target_user_id:string|null;report_id:string|null;action:string;reason:string|null;notes:string|null;entity_type:string|null;entity_id:string|null;created_at:string;moderator:ModerationPerson|null;target:ModerationPerson|null;}
export interface ModerationPage<T> {items:T[];total:number;actorId:string;nextCursor:string|null;page:number;pageSize:number;}

export interface BookChainNode {id:string;chain_id:string;user_id:string;nominee_id:string|null;note:string|null;position:number;created_at:string;reader:(ModerationPerson&{id:string;avatar_url:string|null})|null;}
export interface BookChain {id:string;book_id:string;creator_id:string;created_at:string;books:BookRow;nodes:BookChainNode[];reader_count:number;can_nominate:boolean;}
export interface BookPassEntry {id:string;sender_id:string;recipient_id:string;book_id:string;message:string|null;created_at:string;book:BookRow;sender:(ModerationPerson&{id:string})|null;recipient:(ModerationPerson&{id:string})|null;}
export interface BookPassPage<T> {items:T[];total:number;actorId:string;nextCursor:string|null;}
export interface BookPassReceipt {actorId:string;chainId?:string;bookId?:string;nomineeId?:string;chain?:{id:string;book_id:string;creator_id:string};success?:boolean;position?:number;pass?:{id:string;sender_id:string;recipient_id:string;book_id:string;message:string|null};}
