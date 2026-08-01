// ============================================
// Ultron AI — News Service (NewsAPI + GNews)
// ============================================

import axios from 'axios';
import { NewsArticle } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';

// Cache to avoid repeat API calls
let newsCache: { articles: NewsArticle[]; fetchedAt: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export async function getTopNews(category: 'ai' | 'tech' | 'world' = 'tech'): Promise<NewsArticle[]> {
  // Check cache
  if (newsCache && Date.now() - newsCache.fetchedAt < CACHE_TTL) {
    return newsCache.articles.filter((a) =>
      category === 'ai'
        ? a.category === 'ai'
        : category === 'tech'
        ? a.category === 'tech'
        : true
    );
  }

  const articles: NewsArticle[] = [];

  // NewsAPI
  if (config.services.newsApiKey) {
    try {
      const [aiNews, techNews] = await Promise.all([
        fetchNewsAPI('artificial intelligence machine learning', config.services.newsApiKey),
        fetchNewsAPI('software engineering technology', config.services.newsApiKey),
      ]);

      articles.push(...aiNews.map((a) => ({ ...a, category: 'ai' as const })));
      articles.push(...techNews.map((a) => ({ ...a, category: 'tech' as const })));
    } catch (error) {
      logger.error('NewsAPI error:', error);
    }
  }

  // Hacker News (free, no key needed)
  try {
    const hnArticles = await fetchHackerNews();
    articles.push(...hnArticles);
  } catch (error) {
    logger.warn('Hacker News fetch failed:', error);
  }

  newsCache = { articles, fetchedAt: Date.now() };

  return articles.filter((a) =>
    category === 'ai'
      ? a.category === 'ai'
      : category === 'tech'
      ? a.category === 'tech'
      : true
  );
}

async function fetchNewsAPI(
  query: string,
  apiKey: string
): Promise<Omit<NewsArticle, 'category'>[]> {
  const response = await axios.get('https://newsapi.org/v2/everything', {
    params: {
      q: query,
      sortBy: 'publishedAt',
      pageSize: 5,
      language: 'en',
      apiKey,
    },
    timeout: 10000,
  });

  return (response.data.articles || []).map((a: Record<string, unknown>) => ({
    title: String(a.title || ''),
    description: String(a.description || ''),
    url: String(a.url || ''),
    source: String((a.source as { name?: string })?.name || 'NewsAPI'),
    publishedAt: String(a.publishedAt || new Date().toISOString()),
  }));
}

async function fetchHackerNews(): Promise<NewsArticle[]> {
  const response = await axios.get(
    'https://hacker-news.firebaseio.com/v0/topstories.json',
    { timeout: 8000 }
  );
  const ids: number[] = response.data.slice(0, 5);

  const stories = await Promise.all(
    ids.map((id) =>
      axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeout: 5000 })
    )
  );

  return stories
    .map((s) => s.data)
    .filter((s) => s && s.url)
    .map((s) => ({
      title: s.title,
      description: s.text || s.title,
      url: s.url,
      source: 'Hacker News',
      publishedAt: new Date(s.time * 1000).toISOString(),
      category: 'tech' as const,
    }));
}

export function formatNewsSummary(articles: NewsArticle[]): string {
  if (!articles.length) return 'No news available.';
  return articles
    .slice(0, 5)
    .map((a, i) => `${i + 1}. **${a.title}** (${a.source})`)
    .join('\n');
}
