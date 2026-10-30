export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://liravo.org';

export const ENDPOINTS = {
  // Auth
  auth: {
    login: '/api/auth/login',
    signup: '/api/auth/signup',
    logout: '/api/auth/logout',
    pin: '/api/auth/pin',
    twoFaSetup: '/api/auth/2fa/setup',
    twoFaDisable: '/api/auth/2fa/disable',
  },
  // Users
  users: {
    me: '/api/users/me',
    profile: '/api/users/profile',
    avatar: '/api/users/avatar',
    locale: '/api/users/locale',
    sendVerification: '/api/users/send-verification',
    verifyEmail: '/api/users/verify-email',
    deleteAccount: '/api/users/delete-account',
    export: '/api/users/export',
    accountRecovery: '/api/users/account-recovery',
    unsubscribe: '/api/users/unsubscribe',
    byUsername: (username: string) => `/api/users/${username}`,
    follow: (id: string) => `/api/users/${id}/follow`,
    readingGoal: (id: string) => `/api/users/${id}/reading-goal`,
  },
  // Books
  books: {
    search: '/api/books/search',
    click: '/api/books/click',
    byId: (id: string) => `/api/books/${id}`,
    reviews: (id: string) => `/api/books/${id}/reviews`,
    quotes: (id: string) => `/api/books/${id}/quotes`,
    reactions: (id: string) => `/api/books/${id}/reactions`,
  },
  // Shelves
  shelves: {
    list: '/api/shelves',
    create: '/api/shelves',
    byId: (id: string) => `/api/shelves/${id}`,
  },
  shelfBooks: {
    toggle: '/api/shelf-books/toggle',
    progress: (id: string) => `/api/shelf-books/${id}/progress`,
  },
  // Social
  feed: '/api/feed',
  notifications: '/api/notifications',
  leaderboards: '/api/leaderboards',
  // Reviews & Quotes
  reviews: {
    like: (id: string) => `/api/reviews/${id}/like`,
  },
  quotes: '/api/quotes',
  // Stats
  stats: {
    reading: '/api/stats/reading',
  },
  wrapped: '/api/wrapped',
  tasteProfile: '/api/ai/taste-profile',
  // Community
  buddyReads: {
    list: '/api/buddy-reads',
    create: '/api/buddy-reads',
    byId: (id: string) => `/api/buddy-reads/${id}`,
    join: (id: string) => `/api/buddy-reads/${id}/join`,
    update: (id: string) => `/api/buddy-reads/${id}/update`,
  },
  readingRooms: {
    list: '/api/reading-rooms',
    create: '/api/reading-rooms',
    byId: (id: string) => `/api/reading-rooms/${id}`,
    join: (id: string) => `/api/reading-rooms/${id}/join`,
  },
  debates: {
    list: '/api/debates',
    create: '/api/debates',
    vote: (id: string) => `/api/debates/${id}/vote`,
  },
  events: {
    list: '/api/events',
    create: '/api/events',
    byId: (id: string) => `/api/events/${id}`,
    rsvp: (id: string) => `/api/events/${id}/rsvp`,
    ticket: (id: string) => `/api/events/${id}/ticket`,
  },
  passTheBook: '/api/pass-the-book',
  // Lists
  lists: {
    list: '/api/lists',
    create: '/api/lists',
    byId: (id: string) => `/api/lists/${id}`,
    addBooks: (id: string) => `/api/lists/${id}/books`,
    follow: (id: string) => `/api/lists/${id}/follow`,
    fork: (id: string) => `/api/lists/${id}/fork`,
  },
  // Challenges
  challenges: {
    list: '/api/challenges',
    create: '/api/challenges',
    byId: (id: string) => `/api/challenges/${id}`,
    join: (id: string) => `/api/challenges/${id}/join`,
    progress: (id: string) => `/api/challenges/${id}/progress`,
  },
  // Writing
  write: {
    prompts: '/api/write/prompts',
    promptById: (id: string) => `/api/write/prompts/${id}`,
    submitPrompt: (id: string) => `/api/write/prompts/${id}/submit`,
    questions: '/api/write/questions',
    answerQuestion: (id: string) => `/api/write/questions/${id}/answer`,
    challenges: '/api/write/challenges',
    challengeById: (id: string) => `/api/write/challenges/${id}`,
    joinChallenge: (id: string) => `/api/write/challenges/${id}/join`,
    submitChallenge: (id: string) => `/api/write/challenges/${id}/submit`,
    aiFeedback: '/api/write/ai-feedback',
    progress: '/api/write/progress',
    plan:'/api/write/plan',
    workshops: '/api/write/workshops',
    workshopById: (id: string) => `/api/write/workshops/${id}`,
    joinWorkshop: (id: string) => `/api/write/workshops/${id}/join`,
    workshopSubmissions:(id:string)=>`/api/write/workshops/${id}/submissions`,
    workshopFeedback:(id:string,submissionId:string)=>`/api/write/workshops/${id}/submissions/${submissionId}/feedback`,
  },
  // Author
  author: {
    byUsername: (username: string) => `/api/author/${username}`,
    arcs: '/api/author/arcs',
    createPost: '/api/author/posts',
    verificationRequest: '/api/author/verification-request',
  },
  // Creator
  creator: {
    analytics: '/api/creator/analytics',
    leaderboard: '/api/creator/leaderboard',
  },
  earnings: {
    list: '/api/earnings',
    requestPayout: '/api/earnings/request-payout',
    payoutMethod:'/api/earnings/payout-method',
    cancelPayout:(id:string)=>`/api/earnings/payouts/${id}`,
  },
  tips: {
    create: '/api/tips/create',
  },
  subscriptions: {
    create: '/api/subscriptions/create',
    cancel: '/api/subscriptions/cancel',
  },
  referral: {
    stats: '/api/referral/stats',
  },
  // AI
  ai: {
    recommendations: '/api/ai/recommendations',
    tasteProfile: '/api/ai/taste-profile',
  },
  // Moderation
  moderation: {
    reports: '/api/moderation/reports',
    appeals: '/api/moderation/appeals',
    communityNotes: '/api/moderation/community-notes',
    log: '/api/moderation/log',
  },
  reports: '/api/reports',
  // Admin
  admin: {
    users: '/api/admin/users',
    books: '/api/admin/books',
    featureFlags: '/api/admin/feature-flags',
    affiliateStores: '/api/admin/affiliate-stores',
    promotedListings: '/api/admin/promoted-listings',
    seasonalEvents: '/api/admin/seasonal-events',
    themes: '/api/admin/themes',
    writingChallenges:'/api/admin/writing-challenges',
    payouts: (id: string) => `/api/admin/payouts/${id}/process`,
    verifyAuthor: '/api/admin/verify-author',
    cronStatus: '/api/admin/cron-status',
  },
  // Import
  import: {
    goodreads: '/api/import/goodreads',
  },
  badges: {
    check: '/api/badges/check',
  },
  affiliateTags: '/api/affiliate-tags',
  health: '/api/health',
} as const;
