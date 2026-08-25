import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('./routes/home.tsx'),
  route('analysis', './routes/analysis-index.tsx'),
  route('analysis/:slug', './routes/analysis.tsx'),
  route('articles', './routes/articles-index.tsx'),
  route('articles/:slug', './routes/article.tsx'),
  route('ideas', './routes/ideas-index.tsx'),
  route('ideas/:slug', './routes/idea.tsx'),
  route('memory', './routes/memory-index.tsx'),
  route('memory/map', './routes/memory-map.tsx'),
  route('reviews', './routes/reviews-index.tsx'),
  route('reviews/the-life-you-can-save', './routes/review-legacy-redirect.tsx'),
  route('reviews/:slug', './routes/review.tsx'),
  route('search', './routes/search.tsx'),
  route('tags', './routes/tags-index.tsx'),
  route('tags/:tag', './routes/tag.tsx'),
  route('travel', './routes/travel-index.tsx'),
  route('travel/:slug', './routes/travel.tsx'),
  route('memory/:slug', './routes/memory.tsx'),
] satisfies RouteConfig;
