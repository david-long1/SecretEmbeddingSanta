// Embeddings client for local qwen3-embeddings-mlx server

const EMBEDDING_SERVER_URL = 'http://localhost:8000/embed';

export async function getEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim() === '') {
    // Return zero vector for empty text
    return new Array(1024).fill(0);
  }

  try {
    const response = await fetch(EMBEDDING_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      console.error('Embedding server error:', response.status);
      return new Array(1024).fill(0);
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error('Failed to get embedding:', error);
    return new Array(1024).fill(0);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (normA * normB);
}
