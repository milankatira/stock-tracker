/**
 * Authoritative Atlas Vector Search index definition for the `news`
 * collection. Plan 06-02's embed pipeline reads `NEWS_EMBEDDING_DIM`
 * from here; the committed JSON at `infra/atlas/news_embedding_idx.json`
 * mirrors this file. If either changes, update both in the same commit.
 */
export const NEWS_VECTOR_INDEX_NAME = "news_embedding_idx" as const;
export const NEWS_EMBEDDING_DIM = 768 as const;

export interface VectorIndexDefinition {
  readonly name: typeof NEWS_VECTOR_INDEX_NAME;
  readonly type: "vectorSearch";
  readonly definition: {
    readonly fields: ReadonlyArray<
      | {
          readonly type: "vector";
          readonly path: "embedding";
          readonly numDimensions: number;
          readonly similarity: "cosine";
        }
      | {
          readonly type: "filter";
          readonly path: string;
        }
    >;
  };
}

export const newsVectorIndex: VectorIndexDefinition = {
  name: NEWS_VECTOR_INDEX_NAME,
  type: "vectorSearch",
  definition: {
    fields: [
      {
        type: "vector",
        path: "embedding",
        numDimensions: NEWS_EMBEDDING_DIM,
        similarity: "cosine",
      },
      { type: "filter", path: "instrumentMentions" },
      { type: "filter", path: "publishedAt" },
      { type: "filter", path: "source" },
    ],
  },
};
