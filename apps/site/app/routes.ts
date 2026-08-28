import { index, route, type RouteConfig } from '@react-router/dev/routes';
import { PUBLIC_RELEASE_BINDING_ENV } from '../release-binding';
import {
  loadVerifiedRelease,
  recordsForCollection,
  type CandidateRelease,
} from './release.server';

export function routeConfigForRelease(release?: CandidateRelease) {
  const hasSecondary = (collection: 'analysis' | 'ideas' | 'travel') => (
    release === undefined || recordsForCollection(release, collection).length > 0
  );
  return [
    index('./routes/home.tsx'),
    route('analysis', './routes/analysis-index.tsx'),
    ...(hasSecondary('analysis') ? [route('analysis/:slug', './routes/analysis.tsx')] : []),
    route('articles', './routes/articles-index.tsx'),
    route('articles/:slug', './routes/article.tsx'),
    route('ideas', './routes/ideas-index.tsx'),
    ...(hasSecondary('ideas') ? [route('ideas/:slug', './routes/idea.tsx')] : []),
    route('memory', './routes/memory-index.tsx'),
    route('memory/map', './routes/memory-map.tsx'),
    route('reviews', './routes/reviews-index.tsx'),
    route('reviews/:slug', './routes/review.tsx'),
    route('thoughts', './routes/thoughts-index.tsx'),
    route('thoughts/:slug', './routes/thought.tsx'),
    route('search', './routes/search.tsx'),
    route('tags', './routes/tags-index.tsx'),
    route('tags/:tag', './routes/tag.tsx'),
    route('travel', './routes/travel-index.tsx'),
    ...(hasSecondary('travel') ? [route('travel/:slug', './routes/travel.tsx')] : []),
    route('memory/:slug', './routes/memory.tsx'),
  ] satisfies RouteConfig;
}

const configuredRelease = process.env[PUBLIC_RELEASE_BINDING_ENV]
  ? await loadVerifiedRelease()
  : undefined;

export default routeConfigForRelease(configuredRelease);
