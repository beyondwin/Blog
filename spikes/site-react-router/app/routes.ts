import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('./routes/home.tsx'),
  route('articles/:slug', './routes/article.tsx'),
  route('reviews/:slug', './routes/review.tsx'),
  route('memory/:slug', './routes/memory.tsx'),
] satisfies RouteConfig;
