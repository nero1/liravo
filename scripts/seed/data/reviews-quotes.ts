export interface SeedReview {
  book_isbn_13: string;
  review_type: 'short' | 'one_line';
  rating: number;
  content: string;
  mood_tags: string[];
}

export interface SeedQuote {
  book_isbn_13: string;
  content: string;
  page_number?: number;
}

export const SEED_REVIEWS: SeedReview[] = [
  {
    book_isbn_13: '9780525559474',
    review_type: 'short',
    rating: 5,
    content: 'Haig does something rare here — he turns a high-concept premise into something genuinely moving. The Midnight Library asks what it means to live without regret, then refuses to give you a tidy answer. The prose is quiet and the pacing is sure. One of those books that leaves you recalibrating.',
    mood_tags: ['reflective', 'hopeful', 'emotional'],
  },
  {
    book_isbn_13: '9780571334650',
    review_type: 'short',
    rating: 4,
    content: 'Rooney writes social class the way other novelists write weather — it\'s always present, always shaping. Normal People is uncomfortable in a precise way. The characters want things they don\'t have words for, and somehow Rooney finds those words for them. Not an easy read, but an honest one.',
    mood_tags: ['tense', 'emotional', 'literary'],
  },
  {
    book_isbn_13: '9780385547345',
    review_type: 'short',
    rating: 5,
    content: 'Garmus arrives as a fully-formed novelist. Lessons in Chemistry is funny and sharp and occasionally furious in exactly the right ways. Elizabeth Zott is one of the most memorable protagonists in recent fiction — rigorous, awkward, impossible not to root for. The novel earns every moment of its warmth.',
    mood_tags: ['funny', 'inspiring', 'heartwarming'],
  },
  {
    book_isbn_13: '9780593321201',
    review_type: 'short',
    rating: 5,
    content: 'Zevin writes about creativity the way few novelists manage — with genuine respect for the work, and real knowledge of what it costs. Tomorrow is a book about games that is also a book about friendship and loss and what we make with the time we have. Beautiful, and harder to shake than it looks.',
    mood_tags: ['reflective', 'emotional', 'literary'],
  },
  {
    book_isbn_13: '9780804172707',
    review_type: 'short',
    rating: 5,
    content: 'There is no easy way to talk about A Little Life. Yanagihara writes suffering with a precision that is both devastating and necessary. It is a very long book about love and damage, and it asks whether we can survive the things we\'ve survived. Not for everyone — but for the right reader, transformative.',
    mood_tags: ['dark', 'emotional', 'intense'],
  },
  {
    book_isbn_13: '9781455563937',
    review_type: 'short',
    rating: 5,
    content: 'Min Jin Lee builds her story across generations with the patience of a master craftsman. Pachinko is intimate and epic at once. The saga of the Baek family carries the weight of history without ever losing sight of the individual humans inside it. One of the best novels of the last decade.',
    mood_tags: ['epic', 'emotional', 'historical'],
  },
  {
    book_isbn_13: '9780670026197',
    review_type: 'short',
    rating: 5,
    content: 'Towles writes the kind of novel that makes you want to slow down. A Gentleman in Moscow is a perfect room of a book — small in its setting, vast in everything else. Count Rostov under house arrest for thirty years is one of fiction\'s great characters. Witty, sad, and deeply civilised.',
    mood_tags: ['witty', 'reflective', 'charming'],
  },
  {
    book_isbn_13: '9780307588371',
    review_type: 'short',
    rating: 4,
    content: 'Flynn is vicious and brilliant here. Gone Girl plays its game with complete confidence. The unreliable narrator trick is executed with a precision that makes you feel stupid for not seeing it coming — and smart for seeing it at all. A thriller that knows exactly what it\'s doing.',
    mood_tags: ['tense', 'dark', 'addictive'],
  },
  {
    book_isbn_13: '9781250301697',
    review_type: 'short',
    rating: 4,
    content: 'The Silent Patient knows what it is: a page-turning psychological thriller with a twist that genuinely delivers. Michaelides handles the reveal with care, seeding enough information that the ending feels earned rather than sprung. Satisfying genre fiction that punches above its weight.',
    mood_tags: ['tense', 'addictive', 'mysterious'],
  },
  {
    book_isbn_13: '9780593135204',
    review_type: 'short',
    rating: 5,
    content: 'Weir has done it again — and arguably done it better. Project Hail Mary is the rare hard sci-fi novel that is also emotionally alive. The friendship at its centre is one of the sweetest things in recent genre fiction, and the science is just as rigorous and fun as The Martian. Exceptional.',
    mood_tags: ['funny', 'exciting', 'heartwarming'],
  },
  {
    book_isbn_13: '9780441013593',
    review_type: 'short',
    rating: 5,
    content: 'Dune is the kind of book that rewires your imagination. Herbert built an entire civilisation — politics, religion, ecology, culture — with an internal logic that still holds after sixty years. Not a comfortable read; it wasn\'t meant to be. The benchmark for world-building in science fiction.',
    mood_tags: ['epic', 'thoughtful', 'immersive'],
  },
  {
    book_isbn_13: '9780765326355',
    review_type: 'short',
    rating: 5,
    content: 'Sanderson\'s worldbuilding is staggering, but what elevates The Way of Kings above its peers is the emotional authenticity of its characters. Kaladin\'s struggle reads like a real portrait of depression, threaded inside an enormous fantasy epic. Commitment required — completely worth it.',
    mood_tags: ['epic', 'emotional', 'immersive'],
  },
  {
    book_isbn_13: '9781476746586',
    review_type: 'short',
    rating: 5,
    content: 'Doerr spent ten years on this novel and it shows in every sentence. All the Light We Cannot See is a Pulitzer winner that deserves every word of its acclaim. The parallel structure — Marie-Laure and Werner, war and beauty — is handled with absolute technical mastery and deep moral seriousness.',
    mood_tags: ['historical', 'emotional', 'literary'],
  },
  {
    book_isbn_13: '9780316556347',
    review_type: 'short',
    rating: 5,
    content: 'Circe is one of the most quietly radical retellings in contemporary fiction. Miller gives a minor character from the Odyssey her own rich, searching interiority — and in doing so, writes a novel about power, isolation, and self-determination that feels urgently modern. Gorgeous prose throughout.',
    mood_tags: ['lyrical', 'feminist', 'immersive'],
  },
  {
    book_isbn_13: '9780375842207',
    review_type: 'short',
    rating: 5,
    content: 'The Book Thief is told by Death — which sounds gimmicky until you read it, at which point it seems inevitable. Zusak writes about childhood and war and language with a tenderness that never tips into sentimentality. The ending is devastating in a way only the most careful novels can achieve.',
    mood_tags: ['emotional', 'historical', 'literary'],
  },
  {
    book_isbn_13: '9780062316097',
    review_type: 'short',
    rating: 4,
    content: 'Harari is a writer first and a historian second, and Sapiens benefits from that. The book covers 70,000 years of human history with verve and clarity, never losing sight of the big ideas while keeping the writing lively. Essential reading for anyone trying to understand how we got here.',
    mood_tags: ['informative', 'thought-provoking', 'ambitious'],
  },
  {
    book_isbn_13: '9780399590504',
    review_type: 'short',
    rating: 5,
    content: 'Educated is one of the most remarkable memoirs of the century so far. Westover writes about her extraordinary upbringing with a novelist\'s precision and an honest reckoning with memory\'s unreliability. The book is about education, but also about what we inherit and what we choose to leave behind.',
    mood_tags: ['inspiring', 'intense', 'emotional'],
  },
  {
    book_isbn_13: '9780735211292',
    review_type: 'short',
    rating: 4,
    content: 'Clear\'s central insight — that tiny consistent changes compound into major transformations — is not new, but it\'s rarely been expressed with such clarity and practical detail. Atomic Habits earns its massive readership. A genuinely useful book, clearly organised and practically applied.',
    mood_tags: ['motivating', 'practical', 'informative'],
  },
  {
    book_isbn_13: '9781439156810',
    review_type: 'short',
    rating: 5,
    content: 'On Writing is the best book about the craft of fiction that I\'ve read. King is funny and honest about his own failures, genuinely rigorous about craft, and direct without being prescriptive. The memoir sections are as good as anything he\'s written. Required reading for anyone who wants to write stories.',
    mood_tags: ['inspiring', 'practical', 'witty'],
  },
  {
    book_isbn_13: '9780385480017',
    review_type: 'short',
    rating: 5,
    content: 'Lamott\'s voice is so warm and funny and honest that Bird by Bird almost reads like a letter from a mentor you didn\'t know you needed. The shitty first drafts section alone is worth the price of admission. This is the book to give a writer who is stuck, scared, or starting out.',
    mood_tags: ['encouraging', 'funny', 'practical'],
  },
  {
    book_isbn_13: '9780812988406',
    review_type: 'short',
    rating: 5,
    content: 'Kalanithi was a writer before he was a surgeon before he was a patient, and that sequence matters for what this memoir achieves. When Breath Becomes Air is grief and medicine and philosophy, written by someone who knows the questions matter most when the time is shortest. Devastating and necessary.',
    mood_tags: ['emotional', 'thought-provoking', 'moving'],
  },
  {
    book_isbn_13: '9780735224292',
    review_type: 'short',
    rating: 4,
    content: 'Owens\' debut is a genuinely beautiful piece of nature writing wrapped around a coming-of-age story and a mystery. The North Carolina marshes feel completely real. Kya Clark is one of those characters readers will remember for years. The ending is polarising — I thought it was earned.',
    mood_tags: ['atmospheric', 'emotional', 'beautiful'],
  },
  {
    book_isbn_13: '9780593318171',
    review_type: 'short',
    rating: 4,
    content: 'Ishiguro is at his most direct here and it suits him. Klara\'s narration — polite, precise, achingly literal — becomes the novel\'s emotional engine. A meditation on love, consciousness, and what we are willing to substitute for what we\'ve lost. Quieter than Never Let Me Go, and comparably affecting.',
    mood_tags: ['quiet', 'reflective', 'literary'],
  },
  {
    book_isbn_13: '9781635575637',
    review_type: 'short',
    rating: 5,
    content: 'Piranesi is unlike anything else. Clarke has created a narrative puzzle that rewards slow, attentive reading — and a narrator whose innocence becomes genuinely moving as the mystery clarifies. Short, precise, and deeply strange in the best tradition of weird fiction. Impossible to categorise, easy to love.',
    mood_tags: ['mysterious', 'atmospheric', 'unique'],
  },
  {
    book_isbn_13: '9780062060624',
    review_type: 'short',
    rating: 5,
    content: 'Miller\'s debut is a technical marvel — she retells the Iliad from Patroclus\'s perspective without making it feel like an adaptation. The love story is tender and credible, the war is brutal without being numbing, and the ending is as good as anything in the Homeric original. A rare achievement.',
    mood_tags: ['lyrical', 'emotional', 'epic'],
  },
  {
    book_isbn_13: '9780143127741',
    review_type: 'short',
    rating: 5,
    content: 'Van der Kolk\'s work reshaped how clinicians understand trauma — and The Body Keeps the Score makes that research accessible to a general readership without losing its complexity. Essential reading for anyone trying to understand why psychological wounds express themselves physically, and what we can do about it.',
    mood_tags: ['informative', 'thought-provoking', 'important'],
  },
  {
    book_isbn_13: '9780062654915',
    review_type: 'short',
    rating: 4,
    content: 'Quinn has a gift for weaving dual timelines without losing tension in either thread. The Alice Network is propulsive historical fiction with two memorable female protagonists and a plot that actually respects the history it\'s working with. The best kind of accessible literary thriller.',
    mood_tags: ['historical', 'exciting', 'atmospheric'],
  },
  {
    book_isbn_13: '9781984806734',
    review_type: 'short',
    rating: 4,
    content: 'Henry is the best writer working in commercial romance right now. Beach Read understands how to earn its emotional beats — the banter is sharp, the characters are specific, and by the end you believe the love story completely. A writer\'s love story about what it takes to tell the truth in fiction.',
    mood_tags: ['funny', 'heartwarming', 'enjoyable'],
  },
  {
    book_isbn_13: '9781501139239',
    review_type: 'short',
    rating: 5,
    content: 'Reid tells Evelyn\'s story in fragments — interviews, memories, revelations — and it works perfectly. This is a book about the cost of a life lived under performance, and the love that survived it. One of the most discussed novels of the last decade, and every bit as good as advertised.',
    mood_tags: ['emotional', 'compelling', 'cinematic'],
  },
  {
    book_isbn_13: '9780307352156',
    review_type: 'short',
    rating: 4,
    content: 'Cain\'s research is impeccable, but it\'s her ability to make academic material feel personal that makes Quiet such a compelling read. The book has genuinely changed how many organisations think about introverts in the workplace. Well-argued, empathetic, and practically useful. One of the most impactful popular psychology books of the decade.',
    mood_tags: ['informative', 'empowering', 'thought-provoking'],
  },
];

export const SEED_QUOTES: SeedQuote[] = [
  // The Midnight Library
  { book_isbn_13: '9780525559474', content: 'It is not the lives we regret not living that are the real problem. It is the regret itself.' },
  { book_isbn_13: '9780525559474', content: 'Want is an interesting word. It means lack. A want is also a desire. To want something is to lack it.' },

  // Normal People
  { book_isbn_13: '9780571334650', content: 'But I just want to be able to see you. And do you ever think about it from my perspective, he said. Yes, she said. That\'s why I feel so guilty.' },
  { book_isbn_13: '9780571334650', content: 'I don\'t know why I behave like that sometimes. You don\'t have to explain yourself to me. We talk about everything, I just want to understand.' },

  // Lessons in Chemistry
  { book_isbn_13: '9780385547345', content: 'Men are afraid that women will laugh at them. Women are afraid that men will kill them.' },
  { book_isbn_13: '9780385547345', content: 'Courage is not the absence of fear. It\'s the decision that something else is more important.' },

  // Tomorrow, and Tomorrow
  { book_isbn_13: '9780593321201', content: 'The defining feature of great art is not inspiration. It is persistence. To do the work even when you are not inspired. Especially then.' },
  { book_isbn_13: '9780593321201', content: 'What is a game but a collaboration between the people who make it and the people who play it? All art is this negotiation.' },

  // A Little Life
  { book_isbn_13: '9780804172707', content: 'Wasn\'t friendship its own kind of love? Wasn\'t it as worthy, as transformative, as singular as romantic love?' },
  { book_isbn_13: '9780804172707', content: 'Sometimes, when you are a child, you wait for the person who loves you most to hurt you.' },

  // Pachinko
  { book_isbn_13: '9781455563937', content: 'Living everyday in the presence of those who refuse your humanity takes great courage.' },
  { book_isbn_13: '9781455563937', content: 'There are things in life we cannot choose: how we are born, where we come from. But we can choose what we do with the time we have.' },

  // A Gentleman in Moscow
  { book_isbn_13: '9780670026197', content: 'Do not be fooled by its commonplace appearance. Like so many things, its greatest beauty is beyond what the eyes can see.' },
  { book_isbn_13: '9780670026197', content: 'A man must make his own amusements. A man must pick up his character where he can.' },

  // Gone Girl
  { book_isbn_13: '9780307588371', content: 'I am the craziest bitch you\'ve ever met. I am the nicest person you\'ve ever met. Both things are true.' },
  { book_isbn_13: '9780307588371', content: 'There\'s something disturbing about recalling a warm memory and feeling only cold remorse.' },

  // Project Hail Mary
  { book_isbn_13: '9780593135204', content: 'Science is the process of learning about the world through systematic observation and experimentation. Also, it\'s really cool.' },
  { book_isbn_13: '9780593135204', content: 'The only thing between me and certain death is a thin metal wall and a lot of math.' },

  // Dune
  { book_isbn_13: '9780441013593', content: 'I must not fear. Fear is the mind-killer. Fear is the little-death that brings total obliteration.' },
  { book_isbn_13: '9780441013593', content: 'The mystery of life isn\'t a problem to solve, but a reality to experience.' },
  { book_isbn_13: '9780441013593', content: 'The best questions need time. Don\'t be afraid of silence.' },

  // All the Light We Cannot See
  { book_isbn_13: '9781476746586', content: 'Open your eyes and see what you can with them before they close forever.' },
  { book_isbn_13: '9781476746586', content: 'To shut your eyes is to guess nothing of blindness. Beneath your world of skies and faces and buildings exists a rawer and older world, a place where surface planes dissolve and sounds ribbon in the darkness.' },

  // Circe
  { book_isbn_13: '9780316556347', content: 'In a utilitarian age, of all other times, it is a matter of grave importance that fairy tales should be respected.' },
  { book_isbn_13: '9780316556347', content: 'I had no power, so I became power.' },

  // The Book Thief
  { book_isbn_13: '9780375842207', content: 'I am haunted by humans.' },
  { book_isbn_13: '9780375842207', content: 'The words. Why did they have to exist? Without them, there wouldn\'t be any of this.' },

  // Sapiens
  { book_isbn_13: '9780062316097', content: 'History is something that very few people have been doing while everyone else was ploughing fields and carrying water buckets.' },
  { book_isbn_13: '9780062316097', content: 'We did not domesticate wheat. It domesticated us.' },

  // On Writing
  { book_isbn_13: '9781439156810', content: 'If you don\'t have time to read, you don\'t have the time (or the tools) to write. Simple as that.' },
  { book_isbn_13: '9781439156810', content: 'The road to hell is paved with adverbs.' },
  { book_isbn_13: '9781439156810', content: 'Write with the door closed, rewrite with the door open.' },

  // Bird by Bird
  { book_isbn_13: '9780385480017', content: 'Almost all good writing begins with terrible first efforts. You need to start somewhere.' },
  { book_isbn_13: '9780385480017', content: 'You own everything that happened to you. Tell your stories. If people wanted you to write warmly about them, they should have behaved better.' },

  // When Breath Becomes Air
  { book_isbn_13: '9780812988406', content: 'What makes human life meaningful? I still don\'t know. But I know that if I figure it out, it won\'t be from reading a book. It will be from living.' },
  { book_isbn_13: '9780812988406', content: 'Before you die, it is good to make something that will outlast you.' },

  // The Song of Achilles
  { book_isbn_13: '9780062060624', content: 'Name one hero who was happy. You can\'t.' },
  { book_isbn_13: '9780062060624', content: 'I could recognise him by touch alone, by smell; I would know him blind, by the way he moved... I would know him in death.' },

  // Piranesi
  { book_isbn_13: '9781635575637', content: 'The World is not explained by any theory. It simply is.' },
  { book_isbn_13: '9781635575637', content: 'I have counted two-and-sixty dead in the House. I know each of them intimately.' },

  // Educated
  { book_isbn_13: '9780399590504', content: 'You could call it the power of the human mind over circumstances, or you could call it what I\'d rather call it: the love a parent feels for a child.' },
  { book_isbn_13: '9780399590504', content: 'To admit uncertainty is to admit to weakness, to powerlessness, and to believe in yourself despite both. It is a frailty, but in it is a strength.' },
];
