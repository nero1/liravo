export interface SeedPrompt {
  prompt_text: string;
  topic_seed: string;
}

export const SEED_PROMPTS: SeedPrompt[] = [
  // Week 1 — Character
  { topic_seed: 'character', prompt_text: 'Write a scene where your protagonist makes a decision they know they\'ll regret. What drives them to make it anyway?' },
  { topic_seed: 'character', prompt_text: 'Describe a character through the objects in their bag or pockets — without stating their name or job.' },
  { topic_seed: 'character', prompt_text: 'Your character receives a letter they\'ve been waiting years for. They don\'t open it. Why?' },
  { topic_seed: 'character', prompt_text: 'Write the same character at age 10, 30, and 60. Show how they\'ve changed — and what hasn\'t.' },
  { topic_seed: 'character', prompt_text: 'Two people who were once close meet again after ten years. Neither of them mentions what happened between them. Write the conversation.' },
  { topic_seed: 'character', prompt_text: 'Write a character who is deeply kind in a world that punishes kindness.' },
  { topic_seed: 'character', prompt_text: 'Your antagonist explains their worldview. Write it so the reader almost agrees with them.' },

  // Week 2 — Setting & Place
  { topic_seed: 'setting', prompt_text: 'Write a scene set in an airport at 3am. Who is there, and why?' },
  { topic_seed: 'setting', prompt_text: 'Describe a familiar place — your kitchen, your street, your office — as if you\'re seeing it for the last time.' },
  { topic_seed: 'setting', prompt_text: 'Write a short piece set entirely inside a single room. The character never leaves. Show the world through what enters.' },
  { topic_seed: 'setting', prompt_text: 'A city on the first day that something has irrevocably changed. What does the street feel like?' },
  { topic_seed: 'setting', prompt_text: 'Write a place that is deeply tied to a memory — but through the eyes of someone who has never been there before.' },
  { topic_seed: 'setting', prompt_text: 'Describe a natural landscape during a dramatic weather event. Focus only on what one character notices.' },
  { topic_seed: 'setting', prompt_text: 'Write a scene set in a library — but the books are all wrong.' },

  // Week 3 — Conflict & Tension
  { topic_seed: 'conflict', prompt_text: 'Write a scene where nothing is said but everything is wrong. No dialogue — only action and interiority.' },
  { topic_seed: 'conflict', prompt_text: 'Two characters want the same thing but for entirely different reasons. Let them collide.' },
  { topic_seed: 'conflict', prompt_text: 'Write a confrontation that happens over text messages. Show the gap between what is sent and what is meant.' },
  { topic_seed: 'conflict', prompt_text: 'Your character discovers that someone they trusted has been lying to them for years. Write the moment of realisation.' },
  { topic_seed: 'conflict', prompt_text: 'Write a scene of conflict that contains no raised voices. All the tension is below the surface.' },
  { topic_seed: 'conflict', prompt_text: 'A character must choose between two people they love. They make the choice. Write the aftermath.' },
  { topic_seed: 'conflict', prompt_text: 'Write a scene where the biggest obstacle is the character themselves.' },

  // Week 4 — Voice & Style
  { topic_seed: 'voice', prompt_text: 'Rewrite the same event from two completely different perspectives. Make the reader feel the distance between them.' },
  { topic_seed: 'voice', prompt_text: 'Write a story in second person. Address the reader as "you." Make it uncomfortable in the best way.' },
  { topic_seed: 'voice', prompt_text: 'Write a piece in the voice of an unreliable narrator who believes they are being entirely honest.' },
  { topic_seed: 'voice', prompt_text: 'Tell the story of a breakup using only stage directions and dialogue cues — no narrative prose.' },
  { topic_seed: 'voice', prompt_text: 'Write the same short scene three times: once with brevity, once with lyricism, once with dark humour.' },
  { topic_seed: 'voice', prompt_text: 'Write a first-person narrator who never explicitly says what they want. The reader should know anyway.' },
  { topic_seed: 'voice', prompt_text: 'Write a chapter opening that immediately establishes a unique narrative voice. Make the reader want to spend 300 pages with this voice.' },

  // Week 5 — Beginnings
  { topic_seed: 'beginnings', prompt_text: 'Write the first page of a novel you\'d want to read. Hook the reader in the first two sentences.' },
  { topic_seed: 'beginnings', prompt_text: 'Start a story in the middle of an action. Provide no setup. Trust your reader to catch up.' },
  { topic_seed: 'beginnings', prompt_text: 'Write an opening scene in which a character arrives somewhere they\'ve been avoiding for years.' },
  { topic_seed: 'beginnings', prompt_text: 'Begin a story with a lie. The reader should sense something is off before they can name it.' },
  { topic_seed: 'beginnings', prompt_text: 'Write the inciting incident of a story — the one event that changes everything that follows.' },
  { topic_seed: 'beginnings', prompt_text: 'Open a story with a question that the entire narrative will work to answer — without ever stating the question directly.' },
  { topic_seed: 'beginnings', prompt_text: 'Write an opening in which the setting itself feels like a character.' },

  // Week 6 — Endings
  { topic_seed: 'endings', prompt_text: 'Write an ending in which the main character gets what they wanted but not what they needed.' },
  { topic_seed: 'endings', prompt_text: 'End a story on an image. No explanation. Trust the image to carry the meaning.' },
  { topic_seed: 'endings', prompt_text: 'Write a final scene between two characters. They both know it\'s goodbye. Neither says it.' },
  { topic_seed: 'endings', prompt_text: 'Write an ambiguous ending. Leave one crucial thing unresolved — intentionally.' },
  { topic_seed: 'endings', prompt_text: 'Write a happy ending for a character who doesn\'t believe they deserve one.' },
  { topic_seed: 'endings', prompt_text: 'Write the last line of five different novels. Each should feel inevitable and complete.' },
  { topic_seed: 'endings', prompt_text: 'Write a story that ends exactly where it began — but the meaning has shifted entirely.' },

  // Week 7 — Genre-specific
  { topic_seed: 'genre', prompt_text: 'Write a mystery in which the detective realises they are the one who did it.' },
  { topic_seed: 'genre', prompt_text: 'Write a romance scene where the two characters are in the same room but refusing to acknowledge what both of them know.' },
  { topic_seed: 'genre', prompt_text: 'Write the first contact moment between humanity and an alien intelligence. No clichés. No B-movie tension. Make it strange.' },
  { topic_seed: 'genre', prompt_text: 'Write a horror scene in which the monster is never shown. Fear should come entirely from suggestion.' },
  { topic_seed: 'genre', prompt_text: 'Write a fantasy world in which magic has a very specific, mundane cost. Build one scene around it.' },
  { topic_seed: 'genre', prompt_text: 'Write a literary fiction opening that would fit inside a genre novel. Blur the categories.' },
  { topic_seed: 'genre', prompt_text: 'Write a historical fiction scene in which the characters are unaware of their own historical significance.' },

  // Week 8 — Emotion & Interiority
  { topic_seed: 'emotion', prompt_text: 'Write grief without using the words sad, grief, loss, or pain. Show it only through behaviour.' },
  { topic_seed: 'emotion', prompt_text: 'Write a scene of pure joy that doesn\'t feel saccharine. Where does the shadow fall?' },
  { topic_seed: 'emotion', prompt_text: 'Write fear in the body. Not in the mind. Not in thoughts. What does the body do?' },
  { topic_seed: 'emotion', prompt_text: 'Write a character experiencing deep loneliness in a room full of people.' },
  { topic_seed: 'emotion', prompt_text: 'Write a scene of forgiveness. Make it hard. Make it real. Make it cost something.' },
  { topic_seed: 'emotion', prompt_text: 'Write shame. Not guilt — shame. Show the difference through how the character relates to others.' },
  { topic_seed: 'emotion', prompt_text: 'Write a character falling in love. Not romance — love. The quiet, terrifying, world-altering version.' },

  // Week 9 — Craft & Technique
  { topic_seed: 'craft', prompt_text: 'Write a scene using only dialogue and action beats. No interiority. No description. Let the reader infer everything.' },
  { topic_seed: 'craft', prompt_text: 'Write a single paragraph that takes place over 30 years. Control time deliberately.' },
  { topic_seed: 'craft', prompt_text: 'Write a scene backwards — from end to beginning. Notice how meaning shifts.' },
  { topic_seed: 'craft', prompt_text: 'Describe a moment of violence with restraint. Keep the camera still. Don\'t look away, but don\'t dramatise.' },
  { topic_seed: 'craft', prompt_text: 'Write a scene in which subtext does all the work. What the characters say and what they mean should be entirely different.' },
  { topic_seed: 'craft', prompt_text: 'Write a scene with a ticking clock. The reader should feel the pressure without being told about it.' },
  { topic_seed: 'craft', prompt_text: 'Write a single sentence that tells an entire story. Then write the same story in a single page. Notice what you add — and what survives both versions.' },
];
