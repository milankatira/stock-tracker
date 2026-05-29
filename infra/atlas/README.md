# Atlas Search index definitions

These JSON files mirror the TypeScript constants in
`apps/api/src/news/vector/vector-index.spec.ts` and are the deploy-time
artefact consumed by `atlas-cli` / mongosh when provisioning Atlas
Vector Search indexes. If a TS file changes, regenerate the JSON in the
same commit.

## Deployment

```bash
atlas clusters search indexes create \
  --clusterName <cluster> \
  --file infra/atlas/news_embedding_idx.json
```

## Cross-phase contract

The boot-time assertion in
`apps/api/src/news/vector/vector-index.assert.ts` verifies that the
deployed index has `numDimensions === 768` on startup when
`ATLAS_VECTOR_ASSERT=true`. Local development (and CI on
mongodb-memory-server) skip the assertion silently.
