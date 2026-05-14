export const APP_NAME = 'Liravo';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://liravo.org';

export const GENRES = [
  'Literary Fiction',
  'Science Fiction',
  'Fantasy',
  'Mystery',
  'Thriller',
  'Romance',
  'Horror',
  'Historical Fiction',
  'Nonfiction',
  'Biography',
  'Self-Help',
  'Business',
  'Science',
  'Travel',
  'Poetry',
  'Graphic Novel',
  'Young Adult',
  'Children',
  'Cookbooks',
  'Art & Photography',
] as const;

export const USER_TYPES = ['reader', 'author', 'newbie_writer', 'creator'] as const;
export type UserType = typeof USER_TYPES[number];

export const USER_TYPE_LABELS: Record<UserType, string> = {
  reader: 'Reader',
  author: 'Author',
  newbie_writer: 'Newbie Writer',
  creator: 'Book Content Creator',
};

export const XP_CONFIG = {
  FINISH_BOOK: 50,
  SHORT_REVIEW: 20,
  LONG_REVIEW: 40,
  POST_QUOTE: 10,
  COMPLETE_READING_CHALLENGE: 100,
  COMPLETE_WRITING_CHALLENGE_FREE: 80,
  COMPLETE_WRITING_CHALLENGE_PAID: 120,
  WANT_TO_READ_REACTION: 5,
  REFER_SIGNUP: 200,
  REFER_MILESTONE_10: 500,
  REFER_MILESTONE_50: 2000,
  START_BUDDY_READ: 25,
  DAILY_LOGIN: 3,
  STREAK_7_DAY: 50,
  STREAK_30_DAY: 200,
  FOLLOW_USER: 2,
  RECEIVE_FOLLOWER: 5,
  // Bugfix: use review-like specific XP events instead of overloading unrelated actions.
  REVIEW_LIKE_GIVEN: 2,
  REVIEW_LIKE_RECEIVED: 5,
  SUBMIT_WRITING_PROMPT: 15,
} as const;

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

export const MOOD_TAGS = [
  'Dark',
  'Cozy',
  'Mind-bending',
  'Funny',
  'Emotional',
  'Slow-burn',
  'Fast-paced',
  'Educational',
  'Inspiring',
  'Disturbing',
  'Romantic',
  'Intense',
] as const;

export const RATE_LIMITS = {
  AUTH_MAX_ATTEMPTS: 5,
  AUTH_WINDOW_MINUTES: 15,
  AUTH_LOCKOUT_MINUTES: 30,
} as const;

export const FEATURE_FLAGS = {
  GOOGLE_AUTH: 'google_auth',
  TELEGRAM_AUTH: 'telegram_auth',
  COMMUNITY_NOTES: 'community_notes',
  PREMIUM_SUBSCRIPTIONS: 'premium_subscriptions',
  CREATOR_TIPS: 'creator_tips',
  EVENTS: 'events',
  NEWBIE_WRITER_TRACK: 'newbie_writer_track',
  REFERRAL_SYSTEM: 'referral_system',
} as const;
