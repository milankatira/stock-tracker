import { Logger } from "@nestjs/common";
import type { Connection } from "mongoose";
import {
  NEWS_EMBEDDING_DIM,
  NEWS_VECTOR_INDEX_NAME,
} from "./vector-index.constants";

interface SearchIndexDoc {
  readonly name?: string;
  readonly status?: string;
  readonly queryable?: boolean;
  readonly latestDefinition?: {
    readonly fields?: ReadonlyArray<{
      readonly type?: string;
      readonly path?: string;
      readonly numDimensions?: number;
    }>;
  };
}

/**
 * Boot-time assertion that the Atlas Vector Search index exists with
 * the expected `numDimensions`. A silent dim drift corrupts every
 * subsequent vector query (Pitfall 2 from 06-RESEARCH.md), so we fail
 * loudly at startup if the contract is broken.
 *
 * Skipped by default — Atlas Search is not available on local Mongo or
 * `mongodb-memory-server`. Set `ATLAS_VECTOR_ASSERT=true` to enable in
 * staging/prod (where the index has been provisioned).
 */
export async function assertNewsVectorIndex(
  conn: Connection,
  options: { readonly enabled?: boolean } = {},
): Promise<void> {
  const enabled =
    options.enabled ?? process.env.ATLAS_VECTOR_ASSERT === "true";
  if (!enabled) {
    Logger.warn(
      { reason: "ATLAS_VECTOR_ASSERT!=true" },
      "news_vector_index_assertion_skipped",
    );
    return;
  }

  const coll = conn.collection("news");
  let indexes: SearchIndexDoc[];
  try {
    indexes = await coll
      .aggregate<SearchIndexDoc>([
        { $listSearchIndexes: { name: NEWS_VECTOR_INDEX_NAME } },
      ])
      .toArray();
  } catch (err) {
    throw new Error(
      `Could not enumerate Atlas Search indexes on 'news': ${
        err instanceof Error ? err.message : "unknown"
      }`,
    );
  }

  const match = indexes.find((i) => i.name === NEWS_VECTOR_INDEX_NAME);
  if (!match) {
    throw new Error(
      `Atlas Vector Search index '${NEWS_VECTOR_INDEX_NAME}' not found on 'news'. Create it before starting (see infra/atlas/news_embedding_idx.json).`,
    );
  }

  const vectorField = match.latestDefinition?.fields?.find(
    (f) => f.type === "vector" && f.path === "embedding",
  );
  const dim = vectorField?.numDimensions;
  if (dim !== NEWS_EMBEDDING_DIM) {
    throw new Error(
      `Vector index dim mismatch: expected ${NEWS_EMBEDDING_DIM}, found ${
        dim ?? "(missing)"
      }. Embedding model and index must agree.`,
    );
  }
}
