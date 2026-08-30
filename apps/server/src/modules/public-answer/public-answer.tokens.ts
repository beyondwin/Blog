export const PUBLIC_ANSWER_TOKENS = Object.freeze({
  CONFIG: Symbol('public-answer.config'),
  ANSWER_RELEASE_CATALOG_SOURCE: Symbol('public-answer.answer-release-catalog-source'),
  RETRIEVER: Symbol('public-answer.retriever'),
  EMBEDDING_CLIENT: Symbol('public-answer.embedding-client'),
  ANSWER_GENERATOR: Symbol('public-answer.answer-generator'),
  DETERMINISTIC_VERIFIER: Symbol('public-answer.deterministic-verifier'),
  SEMANTIC_VERIFIER: Symbol('public-answer.semantic-verifier'),
  USAGE_GUARD: Symbol('public-answer.usage-guard'),
  EVENT_SINK: Symbol('public-answer.event-sink'),
} as const);
