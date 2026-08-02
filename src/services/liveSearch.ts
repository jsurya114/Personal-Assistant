import axios from 'axios';
import { logger, logAgent } from '../utils/logger';

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source?: string;
  date?: string;
}

export class LiveSearchService {
  /**
   * Search latest real-time news via Google News RSS (Sports, Politics, Neighborhood, Global, Tech)
   */
  async searchNews(query?: string, location: string = 'Chennai, India'): Promise<SearchResult[]> {
    try {
      let rssUrl = '';
      if (query && query.trim().length > 0) {
        const encodedQuery = encodeURIComponent(query.trim());
        rssUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-IN&gl=IN&ceid=IN:en`;
      } else {
        rssUrl = `https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en`;
      }

      logAgent('LIVE-SEARCH', `Fetching real-time news: ${rssUrl}`);
      const response = await axios.get(rssUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
          Accept: 'application/rss+xml, application/xml, text/xml',
        },
      });

      const xml = String(response.data || '');
      const results: SearchResult[] = [];

      // Extract each <item> block
      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      const items = Array.from(xml.matchAll(itemRegex));

      for (const itemMatch of items.slice(0, 6)) {
        const itemContent = itemMatch[1];
        const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/i);
        const linkMatch = itemContent.match(/<link\s*(?:>([^<]+)<\/link>|(?:\/>))/i) || itemContent.match(/<link>([\s\S]*?)<\/link>/i);
        const pubDateMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
        const sourceMatch = itemContent.match(/<source[^>]*>([\s\S]*?)<\/source>/i);

        let title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : 'News Update';
        const source = sourceMatch ? sourceMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : 'News';
        const date = pubDateMatch ? pubDateMatch[1].trim() : new Date().toLocaleDateString();
        const url = linkMatch ? linkMatch[1]?.trim() || '' : '';

        // Clean HTML entities
        title = title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

        results.push({
          title,
          snippet: `${title} (${source})`,
          url,
          source,
          date,
        });
      }

      return results;
    } catch (error: any) {
      logger.warn(`[LIVE-SEARCH] News search error: ${error?.message || error}`);
      return [];
    }
  }

  /**
   * Search real-time web for sports scores, live questions, facts, politics, and events
   */
  async searchWeb(query: string): Promise<SearchResult[]> {
    try {
      logAgent('LIVE-SEARCH', `Live web search for: "${query}"`);
      
      // 1. First attempt: Google News RSS for instant recent topic matches
      const newsResults = await this.searchNews(query);
      if (newsResults.length > 0) {
        return newsResults;
      }

      // 2. Second attempt: DuckDuckGo HTML Lite search
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await axios.get(ddgUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html',
        },
      });

      const html = String(response.data || '');
      const results: SearchResult[] = [];

      // Extract result-title and result-snippet via regex
      const regex = /<a class="result__snippet[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      const snippets = Array.from(html.matchAll(regex)) as RegExpMatchArray[];
      for (const match of snippets.slice(0, 5)) {
        const rawUrl = match[1] || '';
        const snippet = (match[2] || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").trim();
        if (snippet && snippet.length > 10) {
          results.push({
            title: snippet.slice(0, 80) + '...',
            snippet,
            url: rawUrl,
            source: 'Web Search',
            date: new Date().toLocaleDateString(),
          });
        }
      }

      return results;
    } catch (error: any) {
      logger.warn(`[LIVE-SEARCH] Web search error: ${error?.message || error}`);
      return [];
    }
  }
}

export const liveSearchService = new LiveSearchService();
