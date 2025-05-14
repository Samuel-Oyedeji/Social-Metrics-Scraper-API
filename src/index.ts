import express, { Request, Response, NextFunction, RequestHandler } from "express";
import dotenv from "dotenv";
import { chromium, LaunchOptions, Browser, Page, BrowserContext } from "playwright";

dotenv.config();

const PORT = process.env.PORT || 3000;
const PROXY = process.env.PROXY;
const MAX_RETRIES = 3;
const DELAY_BETWEEN_REQUESTS = 1000; // 1 second delay between requests

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/112.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/14.0.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/113.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36 Edg/114.0.1823.67",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 Version/16.5 Mobile/15E148 Safari/604.1"
];

function randomUA(): string {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

async function launchBrowser(): Promise<Browser> {
  const options: LaunchOptions = { 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  };
  
  if (PROXY) options.proxy = { server: PROXY };
  
  try {
    return await chromium.launch(options);
  } catch (error) {
    console.error("Failed to launch browser:", error);
    throw new Error("Browser launch failed");
  }
}

// Helper to parse shorthand numbers like 1.2M, 4.5K into actual numbers
function parseNumber(text: string | null): number {
  if (!text) return 0;
  
  // Clean the text: remove commas and trim whitespace
  text = text.toLowerCase().trim().replace(/,/g, '');
  
  // Handle 'M' suffix (millions)
  if (text.endsWith('m')) {
    const num = parseFloat(text.substring(0, text.length - 1));
    return Math.round(num * 1_000_000);
  }
  
  // Handle 'K' suffix (thousands)
  if (text.endsWith('k')) {
    const num = parseFloat(text.substring(0, text.length - 1));
    return Math.round(num * 1_000);
  }
  
  // Handle numbers with no suffix
  return parseInt(text, 10) || 0;
}

// Helper to format numbers with commas
function formatWithCommas(n: number): string {
  return n.toLocaleString();
}

// Sleep function for rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry mechanism for operations that might fail
async function withRetry<T>(
  operation: () => Promise<T>, 
  retries = MAX_RETRIES, 
  delay = DELAY_BETWEEN_REQUESTS
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries <= 0) throw error;
    console.log(`Operation failed, retrying... (${MAX_RETRIES - retries + 1}/${MAX_RETRIES})`);
    await sleep(delay);
    return withRetry(operation, retries - 1, delay);
  }
}

// Try to close login popup if it appears
async function tryClosePopup(page: Page): Promise<void> {
  try {
    // Try multiple potential selectors for popup close buttons
    const selectors = [
      'button[aria-label="Close"]',
      'div[role="button"][aria-label="Close"]',
      'svg[aria-label="Close"]',
      '[data-testid="closeButton"]'
    ];
    
    for (const selector of selectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 1000 })) {
        await button.click();
        console.log("Closed popup using selector:", selector);
        return;
      }
    }
    
    // Also try by role
    await page.getByRole("button", { name: "Close" }).click({ timeout: 2000 });
    console.log("Closed popup by role");
  } catch {
    // If no popup or can't close, continue
  }
}

async function scrapeInstagram(url: string) {
  let browser: Browser | null = null;
  
  try {
    browser = await launchBrowser();
    const ctx = await browser.newContext({ userAgent: randomUA() });
    
    // Add stealth plugins
    await ctx.addInitScript(() => {
      // Override navigator properties to appear more like a real browser
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    
    const page = await ctx.newPage();
    
    // Navigate with retry
    await withRetry(async () => {
      await page.goto(url, { waitUntil: "networkidle", timeout: 70000 });
      await tryClosePopup(page);
    });

    // Extract profile stats from meta description with retry
    const profileStats = await withRetry(async () => {
      await page.waitForSelector('meta[property="og:description"]', { timeout: 15000, state: "attached" });
      
      return await page.evaluate(() => {
        const content = document.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? '';
        const match = content.match(/([\d.,]+[KkMm]?)[^\d]+Followers.*?([\d.,]+[KkMm]?)[^\d]+Following.*?([\d.,]+[KkMm]?)[^\d]+Posts/);
        
        const followersRaw = match?.[1] ?? '0';
        const followingRaw = match?.[2] ?? '0';
        const postsRaw = match?.[3] ?? '0';
        
        // Use a function to parse numbers with K/M notation
        function parseNum(text: string | null): number {
          if (!text) return 0;
          
          // Clean the text and prepare for parsing
          text = text.toLowerCase().trim().replace(/,/g, '');
          
          // Handle millions (M suffix)
          if (text.endsWith('m')) {
            const num = parseFloat(text.substring(0, text.length - 1));
            return Math.round(num * 1_000_000);
          }
          
          // Handle thousands (K suffix)
          if (text.endsWith('k')) {
            const num = parseFloat(text.substring(0, text.length - 1));
            return Math.round(num * 1_000);
          }
          
          // Handle regular numbers
          return parseInt(text, 10) || 0;
        }
        
        return {
          followers: parseNum(followersRaw),
          following: parseNum(followingRaw),
          postCount: parseNum(postsRaw),
        };
      });
    });

    // Extract post links
    const links = await withRetry(async () => {
      return await page.$$eval("article a", els =>
        els.slice(0, 20).map(a => a.getAttribute("href")).filter(Boolean) as string[]
      );
    });

    // Process posts with rate limiting
    const results: Array<{ post: string; likes: string; comments: string }> = [];
    
    for (const href of links.slice(0, 15)) {  // Limit to 15 posts
      await sleep(DELAY_BETWEEN_REQUESTS);  // Add delay between post requests
      
      // Open post in new tab
      const postPage = await ctx.newPage();
      try {
        await withRetry(async () => {
          await postPage.goto(`https://www.instagram.com${href}`, { waitUntil: "networkidle", timeout: 70000 });
          await tryClosePopup(postPage);
        });
        
        // Extract post data with retry
        const postData = await withRetry(async () => {
          return await postPage.evaluate(() => {
            const content = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
            const match = content.match(/([\d.,]+[KkMm]?)[^\d]+likes.*?([\d.,]+[KkMm]?)[^\d]+comments.*?"([^"]+)"/);
            
            const likesRaw = match?.[1] ?? '0';
            const commentsRaw = match?.[2] ?? '0';
            const postText = match?.[3] ?? '';
            
            // Define the parseNumber function inside the evaluate context
            function parseNum(text: string | null): number {
              if (!text) return 0;
              
              // Clean the text: remove commas and trim whitespace
              text = text.toLowerCase().trim().replace(/,/g, '');
              
              // Handle 'M' suffix (millions)
              if (text.endsWith('m')) {
                const num = parseFloat(text.substring(0, text.length - 1));
                return Math.round(num * 1_000_000);
              }
              
              // Handle 'K' suffix (thousands)
              if (text.endsWith('k')) {
                const num = parseFloat(text.substring(0, text.length - 1));
                return Math.round(num * 1_000);
              }
              
              // Handle numbers with no suffix
              return parseInt(text, 10) || 0;
            }
            
            return {
              likes: parseNum(likesRaw),
              comments: parseNum(commentsRaw),
              postName: postText.trim(),
            };
          });
        });
        
        results.push({
          post: postData.postName,
          likes: formatWithCommas(postData.likes),
          comments: formatWithCommas(postData.comments),
        });
      } catch (error) {
        console.error(`Error processing post ${href}:`, error);
      } finally {
        await postPage.close();
      }
    }

    return {
      followers: formatWithCommas(profileStats.followers),
      following: formatWithCommas(profileStats.following),
      postCount: formatWithCommas(profileStats.postCount),
      posts: results,
    };
  } catch (error) {
    console.error("Instagram scraping error:", error);
    throw new Error(`Failed to scrape Instagram: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeTwitter(url: string) {
  let browser: Browser | null = null;
  
  try {
    browser = await launchBrowser();
    const ctx = await browser.newContext({ userAgent: randomUA() });
    
    // Add stealth plugins
    await ctx.addInitScript(() => {
      // Override navigator properties to appear more like a real browser
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    
    const page = await ctx.newPage();
    
    // Navigate with retry
    await withRetry(async () => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 70000 });
    });

    // Extract profile data with retry
    const profile = await withRetry(async () => {
      // Wait for the ld+json script to load
      await page.waitForSelector('script[type="application/ld+json"][data-testid="UserProfileSchema-test"]', 
        { timeout: 70000, state: "attached" });
      
      return await page.evaluate(() => {
        const scriptTag = document.querySelector('script[type="application/ld+json"][data-testid="UserProfileSchema-test"]');
        if (!scriptTag) return null;
        try {
          return JSON.parse(scriptTag.textContent || '');
        } catch {
          return null;
        }
      });
    });

    if (!profile) {
      throw new Error("Could not extract Twitter profile data.");
    }

    const stats = profile.mainEntity?.interactionStatistic || [];
    const findStat = (name: string) => {
      const match = stats.find((s: any) => s.name === name);
      return match?.userInteractionCount ?? 0;
    };

    const followers = findStat("Follows");
    const following = findStat("Friends");
    const tweetCount = findStat("Tweets");

    // Scroll and extract tweets
    let tweetsScraped = 0;
    const results: Array<{
      post: string;
      likes: string;
      retweets: string;
      replies: string;
      bookmarks: string;
      views: string;
    }> = [];

    // Scroll multiple times with delays
    let scrollAttempts = 0;
    const maxScrollAttempts = 10;
    
    while (tweetsScraped < 15 && scrollAttempts < maxScrollAttempts) {
      // Extract tweets on current page
      const tweets = await page.$$('[data-testid="tweet"]');
      
      for (const tweet of tweets) {
        if (tweetsScraped >= 15) break;
        
        try {
          // Get post text safely
          const postText = await tweet.$eval('div[lang]', el => el.textContent?.trim() || '')
            .catch(() => 'No text available');
          
          // Get metrics safely
          const ariaLabel = await tweet
            .$eval('div[role="group"][aria-label]', el => el.getAttribute('aria-label') || '')
            .catch(() => '');
          
          // Defaults
          let replies = '0', retweets = '0', likes = '0', bookmarks = '0', views = '0';
          
          if (ariaLabel) {
            // Try different pattern matches for metrics
            const fullMatch = ariaLabel.match(/(\d[\d,]*) replies, (\d[\d,]*) reposts, (\d[\d,]*) likes, (\d[\d,]*) bookmarks, (\d[\d,]*) views/i);
            const partialMatch = ariaLabel.match(/(\d[\d,]*) replies, (\d[\d,]*) reposts, (\d[\d,]*) likes, (\d[\d,]*) bookmarks/i);
            const minimalMatch = ariaLabel.match(/(\d[\d,]*) replies, (\d[\d,]*) reposts, (\d[\d,]*) likes/i);
            
            if (fullMatch) {
              [, replies, retweets, likes, bookmarks, views] = fullMatch;
            } else if (partialMatch) {
              [, replies, retweets, likes, bookmarks] = partialMatch;
            } else if (minimalMatch) {
              [, replies, retweets, likes] = minimalMatch;
            }
          }
          
          // Add tweet data if it has content
          if (postText && postText !== 'No text available') {
            results.push({
              post: postText,
              likes,
              retweets,
              replies,
              bookmarks,
              views
            });
            
            tweetsScraped++;
          }
        } catch (error) {
          console.error("Error processing tweet:", error);
        }
      }
      
      // Scroll down to load more tweets if needed
      if (tweetsScraped < 15) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await sleep(3000); // Wait for tweets to load
      }
      
      scrollAttempts++;
    }

    console.log("Twitter scrape completed:", tweetsScraped, "tweets extracted");

    return {
      followers: followers.toLocaleString(),
      following: following.toLocaleString(),
      tweetCount: tweetCount.toLocaleString(),
      tweets: results
    };
  } catch (error) {
    console.error("Twitter scraping error:", error);
    throw new Error(`Failed to scrape Twitter: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (browser) await browser.close();
  }
}

// Middleware for request validation
const validateRequest: RequestHandler = (req, res, next) => {
  const url = req.body.url as string;
  
  if (!url) {
    res.status(400).json({ error: "Missing url in JSON body" });
    return;
  }
  
  if (typeof url !== 'string') {
    res.status(400).json({ error: "URL must be a string" });
    return;
  }
  
  // Validate URL is from supported platforms
  if (!url.match(/^https?:\/\/(www\.)?(instagram\.com|twitter\.com|x\.com)/i)) {
    res.status(400).json({ 
      error: "Unsupported platform. Only Instagram, Twitter, and X.com are supported" 
    });
    return;
  }
  
  next();
};

// Middleware for error handling
const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("API Error:", err);
  res.status(500).json({ 
    error: err.message || "An unexpected error occurred", 
    timestamp: new Date().toISOString() 
  });
};

// Health check endpoint
const healthCheck: RequestHandler = (_req, res) => {
  res.json({
    status: "ok",
    message: "🎉 Scraper API up!",
    timestamp: new Date().toISOString()
  });
};

// Main scrape handler
const scrapeHandler: RequestHandler = async (req, res, next) => {
  const url = req.body.url as string;

  try {
    let data;
    if (url.includes("instagram.com")) {
      data = await scrapeInstagram(url);
    } else if (url.includes("twitter.com") || url.includes("x.com")) {
      data = await scrapeTwitter(url);
    } else {
      // This should be caught by the validation middleware, but just in case
      res.status(400).json({ error: "Unsupported platform" });
      return;
    }

    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error); // Pass to error handler
  }
};

// Set up Express app
const app = express();
app.use(express.json());

// Register routes
app.get("/", healthCheck);
app.get("/health", healthCheck);
app.post("/scrape", validateRequest, scrapeHandler);

// Register error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => console.log(`🚀 Scraper API running on http://localhost:${PORT}`));

// Handle process termination
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  process.exit(0);
});

export default app; // For testing