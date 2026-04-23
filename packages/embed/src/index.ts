export interface EmbeddingModel {
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
  dimension: number;
  dispose(): void;
}

/**
 * Deterministic character-trigram hashing embedder.
 * No model, no dependencies, no network. Works everywhere (browser,
 * node, React Native). Good for obvious near-duplicates like
 * "deck" / "deck again" / "the deck thing". Used as a fallback and
 * on constrained platforms (React Native).
 */
export class SimpleEmbedder implements EmbeddingModel {
  dimension = 128;

  async embed(text: string): Promise<Float32Array> {
    return this.hashEmbed(text);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => this.hashEmbed(t));
  }

  private hashEmbed(text: string): Float32Array {
    const vec = new Float32Array(this.dimension);
    const normalized = text.toLowerCase().trim();

    for (let i = 0; i < normalized.length - 2; i++) {
      const trigram = normalized.slice(i, i + 3);
      const hash = this.hashTrigram(trigram);
      const idx = Math.abs(hash) % this.dimension;
      vec[idx] += hash > 0 ? 1 : -1;
    }

    for (let i = 0; i < normalized.length - 1; i++) {
      const bigram = normalized.slice(i, i + 2);
      const hash = this.hashTrigram(bigram + "_");
      const idx = Math.abs(hash) % this.dimension;
      vec[idx] += (hash > 0 ? 1 : -1) * 0.5;
    }

    const words = normalized.split(/\s+/);
    for (const word of words) {
      const hash = this.hashTrigram(word);
      const idx = Math.abs(hash) % this.dimension;
      vec[idx] += (hash > 0 ? 1 : -1) * 2;
    }

    let mag = 0;
    for (let i = 0; i < vec.length; i++) mag += vec[i] * vec[i];
    mag = Math.sqrt(mag);
    if (mag > 0) {
      for (let i = 0; i < vec.length; i++) vec[i] /= mag;
    }

    return vec;
  }

  private hashTrigram(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return h;
  }

  dispose() {}
}

/**
 * On-device sentence embeddings using MiniLM-L6-v2 via @xenova/transformers.
 * Runs entirely in the browser (WASM) or Node (onnxruntime-node).
 * Model is ~22MB, downloaded once and cached in IndexedDB/fs.
 * Nothing ever leaves the device. 384-dimensional mean-pooled
 * normalised embeddings.
 */
export class MiniLmEmbedder implements EmbeddingModel {
  dimension = 384;
  private pipelinePromise: Promise<any> | null = null;
  private fallback = new SimpleEmbedder();

  constructor(private modelId: string = "Xenova/all-MiniLM-L6-v2") {}

  private async getPipeline(): Promise<any> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        const { pipeline, env } = await import("@xenova/transformers");
        // Prefer the quantised model for smaller download and faster CPU inference.
        (env as any).allowRemoteModels = true;
        return pipeline("feature-extraction", this.modelId, {
          quantized: true,
        });
      })();
    }
    return this.pipelinePromise;
  }

  async embed(text: string): Promise<Float32Array> {
    try {
      const extractor = await this.getPipeline();
      const output = await extractor(text, {
        pooling: "mean",
        normalize: true,
      });
      return new Float32Array(output.data as Float32Array);
    } catch (err) {
      console.warn("[embed] MiniLM unavailable, using hash fallback:", err);
      return this.fallback.embed(text);
    }
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    try {
      const extractor = await this.getPipeline();
      const output = await extractor(texts, {
        pooling: "mean",
        normalize: true,
      });
      const data = output.data as Float32Array;
      const result: Float32Array[] = [];
      for (let i = 0; i < texts.length; i++) {
        result.push(data.slice(i * this.dimension, (i + 1) * this.dimension));
      }
      return result;
    } catch {
      return Promise.all(texts.map((t) => this.embed(t)));
    }
  }

  dispose() {
    this.pipelinePromise = null;
  }
}

/**
 * Factory. Defaults to MiniLM (real embeddings) on platforms that
 * support dynamic import of @xenova/transformers. Pass `{ simple: true }`
 * to force the hash embedder (e.g. on React Native).
 */
export function createEmbedder(options?: { simple?: boolean }): EmbeddingModel {
  if (options?.simple) return new SimpleEmbedder();
  return new MiniLmEmbedder();
}
