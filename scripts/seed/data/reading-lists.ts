export interface SeedReadingList {
  title: string;
  description: string;
  book_isbn_13s: string[];
}

export const SEED_READING_LISTS: SeedReadingList[] = [
  {
    title: 'Best Books of the Last 5 Years',
    description: 'The standout reads of the past five years — acclaimed, loved, and impossible to put down.',
    book_isbn_13s: [
      '9780525559474', // The Midnight Library
      '9780385547345', // Lessons in Chemistry
      '9780593321201', // Tomorrow, and Tomorrow, and Tomorrow
      '9780593135204', // Project Hail Mary
      '9780593311043', // Klara and the Sun
      '9780063251922', // Demon Copperhead
      '9781538742006', // The Housemaid
      '9781649374042', // Fourth Wing
      '9780593311776', // The Lincoln Highway
      '9781982168438', // Cloud Cuckoo Land
    ],
  },
  {
    title: 'Essential Literary Fiction',
    description: 'A curated selection of modern literary fiction that every serious reader should know.',
    book_isbn_13s: [
      '9780804172707', // A Little Life
      '9781455563937', // Pachinko
      '9780679731726', // The Remains of the Day
      '9780812979657', // The God of Small Things
      '9780393356687', // The Overstory
      '9780812985405', // Lincoln in the Bardo
      '9780571334650', // Normal People
      '9780805080681', // Wolf Hall
      '9780812988406', // When Breath Becomes Air
    ],
  },
  {
    title: 'Can\'t-Put-Down Thrillers',
    description: 'These gripping page-turners will have you reading until 3am. Don\'t say we didn\'t warn you.',
    book_isbn_13s: [
      '9780307588371', // Gone Girl
      '9780307454546', // The Girl with the Dragon Tattoo
      '9781250301697', // The Silent Patient
      '9781538724736', // Verity
      '9781538742006', // The Housemaid
      '9780062678416', // The Woman in the Window
      '9780143113492', // In the Woods
      '9780399167065', // Big Little Lies
    ],
  },
  {
    title: 'Science Fiction Essentials',
    description: 'From classics to modern masterpieces, these are the sci-fi books every reader should experience.',
    book_isbn_13s: [
      '9780441013593', // Dune
      '9780345391803', // The Hitchhiker\'s Guide
      '9780812550702', // Ender\'s Game
      '9780553418026', // The Martian
      '9780593135204', // Project Hail Mary
      '9780765382030', // The Three-Body Problem
      '9780316452502', // Children of Time
      '9780316547611', // The Power
      '9780451524935', // 1984
    ],
  },
  {
    title: 'Best Fantasy Series Starters',
    description: 'Open the door to extraordinary worlds. Each of these begins an unforgettable series.',
    book_isbn_13s: [
      '9780618346257', // The Fellowship of the Ring
      '9780756404741', // The Name of the Wind
      '9780765326355', // The Way of Kings
      '9781619634442', // A Court of Thorns and Roses
      '9781649374042', // Fourth Wing
      '9780062662583', // The Poppy War
      '9781250217288', // The House in the Cerulean Sea
    ],
  },
  {
    title: 'Beloved Historical Fiction',
    description: 'Immerse yourself in the past through these meticulously crafted historical novels.',
    book_isbn_13s: [
      '9781476746586', // All the Light We Cannot See
      '9780375842207', // The Book Thief
      '9780316556347', // Circe
      '9780062060624', // The Song of Achilles
      '9780451166890', // The Pillars of the Earth
      '9780670026190', // A Gentleman in Moscow
      '9780062654915', // The Alice Network
      '9780805080681', // Wolf Hall
    ],
  },
  {
    title: 'Books If You Loved Emily Henry',
    description: 'You tore through Emily Henry\'s novels — here\'s what to read next.',
    book_isbn_13s: [
      '9781984806734', // Beach Read
      '9781984806758', // People We Meet on Vacation
      '9780593334836', // Book Lovers
      '9780062439598', // The Hating Game
      '9780451490803', // The Kiss Quotient
      '9781250316776', // Red, White & Royal Blue
      '9781501128035', // The Unhoneymooners
      '9781250244499', // One Last Stop
    ],
  },
  {
    title: 'Books If You Loved Colleen Hoover',
    description: 'Finished your CoHo TBR? These emotionally intense reads will fill the void.',
    book_isbn_13s: [
      '9781501110368', // It Ends with Us
      '9781538724736', // Verity
      '9781501139239', // The Seven Husbands of Evelyn Hugo
      '9780525559474', // The Midnight Library
      '9780735224292', // Where the Crawdads Sing
      '9781984806734', // Beach Read
      '9780062439598', // The Hating Game
    ],
  },
  {
    title: 'Must-Read Nonfiction',
    description: 'Mind-expanding nonfiction that will change how you see yourself and the world.',
    book_isbn_13s: [
      '9780062316097', // Sapiens
      '9780399590504', // Educated
      '9781524763138', // Becoming
      '9780735211292', // Atomic Habits
      '9780143127741', // The Body Keeps the Score
      '9780307352156', // Quiet
      '9780812988406', // When Breath Becomes Air
      '9780735223714', // Know My Name
      '9780525555360', // The Anthropocene Reviewed
    ],
  },
  {
    title: 'For Writers: Essential Craft Books',
    description: 'Every writer\'s bookshelf should include these. Study them, annotate them, live by them.',
    book_isbn_13s: [
      '9781439156810', // On Writing - Stephen King
      '9780385480017', // Bird by Bird
      '9780060391683', // Story
      '9780205313426', // The Elements of Style
      '9781594634727', // Big Magic
    ],
  },
  {
    title: 'Books That Broke the Internet',
    description: 'These books went viral for a reason — they genuinely earn the hype.',
    book_isbn_13s: [
      '9780735224292', // Where the Crawdads Sing
      '9781538724736', // Verity
      '9781501110368', // It Ends with Us
      '9780385547345', // Lessons in Chemistry
      '9780593135204', // Project Hail Mary
      '9781649374042', // Fourth Wing
      '9780593321201', // Tomorrow, and Tomorrow, and Tomorrow
      '9781501139239', // The Seven Husbands of Evelyn Hugo
    ],
  },
  {
    title: 'Short Books That Pack a Punch',
    description: 'Under 300 pages — but they\'ll stay with you for years.',
    book_isbn_13s: [
      '9780765397539', // All Systems Red
      '9780679731726', // The Remains of the Day
      '9781635575637', // Piranesi
      '9780743273565', // The Great Gatsby
      '9780812988406', // When Breath Becomes Air
      '9780205313426', // The Elements of Style
      '9780007207008', // The Year of Magical Thinking
      '9780345391803', // Hitchhiker\'s Guide
    ],
  },
  {
    title: 'Epic Reads (700+ Pages)',
    description: 'For when you want a book to truly get lost in. Clear your schedule.',
    book_isbn_13s: [
      '9780804172707', // A Little Life
      '9780765326355', // The Way of Kings
      '9780441013593', // Dune
      '9780316452502', // Children of Time
      '9780451166890', // The Pillars of the Earth
      '9780756404741', // The Name of the Wind
    ],
  },
  {
    title: 'Best Debut Novels',
    description: 'First-time novelists who arrived fully-formed and completely electrifying.',
    book_isbn_13s: [
      '9780735224292', // Where the Crawdads Sing
      '9780812979657', // The God of Small Things
      '9780062662583', // The Poppy War
      '9781635575637', // Piranesi
      '9780571334650', // Normal People
      '9780062654915', // The Alice Network
      '9781250301697', // The Silent Patient
      '9781250186447', // A Memory Called Empire
    ],
  },
  {
    title: 'Classics Every Reader Should Know',
    description: 'The books that shaped literature. Essential, influential, and deeply rewarding.',
    book_isbn_13s: [
      '9780061743528', // To Kill a Mockingbird
      '9780451524935', // 1984
      '9780141439518', // Pride and Prejudice
      '9780743273565', // The Great Gatsby
      '9780140449136', // Crime and Punishment
      '9780060883287', // One Hundred Years of Solitude
      '9781400033416', // Beloved
      '9780618346257', // The Fellowship of the Ring
    ],
  },
  {
    title: 'Books About Books and Writing',
    description: 'Meta, wonderful, and deeply satisfying — books where reading and writing are central.',
    book_isbn_13s: [
      '9780375842207', // The Book Thief
      '9781439156810', // On Writing
      '9780385480017', // Bird by Bird
      '9780593334836', // Book Lovers
      '9781984806734', // Beach Read
      '9780525555360', // The Anthropocene Reviewed
      '9781594634727', // Big Magic
    ],
  },
  {
    title: 'Heartbreaking and Hopeful',
    description: 'These novels will wreck you — then quietly put you back together.',
    book_isbn_13s: [
      '9780804172707', // A Little Life
      '9780525559474', // The Midnight Library
      '9780399590504', // Educated
      '9780812988406', // When Breath Becomes Air
      '9781476738024', // A Man Called Ove
      '9780375842207', // The Book Thief
      '9780735223714', // Know My Name
      '9780812985405', // Lincoln in the Bardo
    ],
  },
  {
    title: 'Mythology Retold',
    description: 'Ancient stories through a modern, often feminist, lens. Electrifying retellings.',
    book_isbn_13s: [
      '9780316556347', // Circe
      '9780062060624', // The Song of Achilles
      '9780385534635', // The Night Circus
      '9780756404741', // The Name of the Wind
    ],
  },
  {
    title: 'Books for Your Next Vacation',
    description: 'Beach, mountain, or city break — these are the perfect holiday companions.',
    book_isbn_13s: [
      '9781984806758', // People We Meet on Vacation
      '9781984806734', // Beach Read
      '9780385547345', // Lessons in Chemistry
      '9781501160837', // Anxious People
      '9781984880819', // The Thursday Murder Club
      '9780735224292', // Where the Crawdads Sing
      '9780385534635', // The Night Circus
    ],
  },
  {
    title: 'Bestselling Memoirs',
    description: 'True stories told by the people who lived them. Raw, revealing, and unforgettable.',
    book_isbn_13s: [
      '9780399590504', // Educated
      '9781524763138', // Becoming
      '9780812988406', // When Breath Becomes Air
      '9780735223714', // Know My Name
      '9780007207008', // The Year of Magical Thinking
      '9780525555360', // The Anthropocene Reviewed
    ],
  },
];
