const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: `Method ${req.method} not allowed.` });
    }

    const keyword = req.body.keyword;
    if (!keyword) {
        return res.status(400).json({ error: 'Please enter a keyword to search.' });
    }

    const encodedKeyword = encodeURIComponent(keyword);
    let targetUrl = `https://scholar.google.com/scholar?hl=en&as_sdt=0%2C5&q=${encodedKeyword}&btnG=`;

    let urlsToVisit = [targetUrl];
    const maxCrawlLength = 10; // Limit the number of crawled pages to reduce execution time
    let crawledCount = 0;
    const articleData = [];
    const visitedUrls = new Set();

    try {
        // Process multiple URLs concurrently, but limit the number of concurrent requests
        while (urlsToVisit.length > 0 && crawledCount < maxCrawlLength) {
            // Limit concurrent requests (e.g., 5 at a time)
            const currentBatch = urlsToVisit.splice(0, 5);
            const fetchPromises = currentBatch.map(async (url) => {
                if (visitedUrls.has(url)) return null;
                visitedUrls.add(url);
                crawledCount++;

                try {
                    const response = await axios.get(url, {
                        timeout: 10000, // Short timeout for individual requests
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                        }
                    });

                    if (!response.data) {
                        console.error(`No data received for ${url}`);
                        return null;
                    }

                    const $ = cheerio.load(response.data);
                    const newUrls = [];
                    $('a').each((index, element) => {
                        const url = $(element).attr('href');
                        if (url && url.startsWith("https://") && !visitedUrls.has(url) && !url.includes("google") && !url.includes("download")) {
                            newUrls.push(url);
                        }
                    });

                    // Add new URLs to the list of URLs to visit
                    urlsToVisit.push(...newUrls);

                    // Extract article data (use the old method for extracting abstracts)
                    const data = {
                        url,
                        title: $('title').text().trim(),
                        abstract: ''
                    };

                    // Old abstract extraction logic
                    const abstractElement = $('*:contains("Abstract")')
                        .filter((_, el) => $(el).text().trim() === "Abstract")
                        .nextUntil(':header')  // Adjust selector if sibling structure differs
                        .text()
                        .trim();

                    // Fallback if abstract is not found
                    if (abstractElement) {
                        data.abstract = abstractElement;
                    } else {
                        data.abstract = $('meta[name="description"]').attr('content') || "Abstract not found";
                    }

                    // Push the scraped data to the array
                    return data;

                } catch (fetchError) {
                    console.error(`Error fetching ${url}: ${fetchError.message}`);
                    return null;
                }
            });

            // Wait for the batch of requests to complete
            const results = await Promise.all(fetchPromises);
            articleData.push(...results.filter(Boolean));  // Filter out null responses

            // Optionally, delay between batches to avoid overwhelming external sites
            await new Promise(resolve => setTimeout(resolve, 1000));  // 1-second delay between batches
        }

        res.status(200).json({ articles: articleData, keyword: keyword });

    } catch (error) {
        console.error('Error during crawling:', error.message);
        res.status(500).json({ error: 'Error occurred while scraping. Please try again later.' });
    }
};
