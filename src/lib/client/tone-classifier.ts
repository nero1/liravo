// On-device tone classifier using Transformers.js (Hugging Face)
// Loaded lazily client-side only — never runs on the server.

export type ClientToneResult = 'safe' | 'warning' | 'toxic';

let pipeline: ((text: string) => Promise<Array<{ label: string; score: number }>>) | null = null;
let loadError = false;

async function loadPipeline() {
  if (pipeline || loadError) return;
  try {
    // Dynamic import ensures this code never runs in SSR context
    const { pipeline: createPipeline, env } = await import('@huggingface/transformers');
    // Use WASM backend; disable local model lookup to force remote CDN load
    env.allowLocalModels = false;
    // Xenova/toxic-bert is a small DistilBERT model (~67MB) fine-tuned for toxicity
    // It classifies text as 'toxic' or 'non-toxic'
    const p = await createPipeline(
      'text-classification',
      'Xenova/toxic-bert',
      { device: 'wasm' }
    );
    // Wrap to normalise output format
    pipeline = async (text: string) => {
      const result = await p(text, { top_k: 2 });
      return result as Array<{ label: string; score: number }>;
    };
  } catch {
    loadError = true;
  }
}

export async function classifyReviewTone(text: string): Promise<ClientToneResult> {
  if (typeof window === 'undefined') return 'safe';
  if (text.trim().length < 10) return 'safe';

  await loadPipeline();
  if (!pipeline) return 'safe'; // Gracefully degrade if model fails to load

  try {
    const results = await pipeline(text.slice(0, 512));
    const toxic = results.find((r) => r.label.toLowerCase() === 'toxic');
    if (!toxic) return 'safe';
    if (toxic.score > 0.85) return 'toxic';
    if (toxic.score > 0.5) return 'warning';
    return 'safe';
  } catch {
    return 'safe';
  }
}
