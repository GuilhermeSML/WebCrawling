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
    const maxCrawlLength = 20; // Reduce to 5 for Vercel's serverless time limits
    let crawledCount = 0;
    const articleData = [];
    const visitedUrls = new Set();

    let crawlFinished = false;
    const timeout = setTimeout(() => {
        if (!crawlFinished) {
            console.log('Timeout reached, sending partial results...');
            res.status(200).json({ articles: articleData, keyword: keyword });
        }
    }, 15000);  // Timeout reduced

    try {
        for (; urlsToVisit.length > 0 && crawledCount < maxCrawlLength;) {
            const currentUrl = urlsToVisit.shift();

            if (visitedUrls.has(currentUrl)) continue;
            visitedUrls.add(currentUrl);

            crawledCount++;

            try {
                const response = await axios.get(currentUrl, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });

                if (!response.data) {
                    console.error('No data received');
                    continue;
                }

                const $ = cheerio.load(response.data);
                $('a').each((index, element) => {
                    let url = $(element).attr('href');
                    if (url && url.startsWith("https://") && !visitedUrls.has(url) && !url.includes("google") && !url.includes("download")) {
                        urlsToVisit.push(url);
                    }
                });

                // Extract article data after the first URL (to avoid scraping the search result page itself)
                if (crawledCount > 1) {
                    const data = {};

                    data.url = currentUrl;
                    data.title = $('title').text().trim();

                    if (currentUrl.includes('hal.science')) {
                        const abstractText = $('div.abstract').text().trim(); // Adjust selector based on actual structure
                        data.abstract = abstractText || "Abstract not found";
                    } else {
                        // Abstract extraction logic
                        data.abstract = $('*:contains("Abstract")').filter((_, el) => $(el).text().trim() === "Abstract")
                            .nextUntil(':header')  // Adjust selector if sibling structure differs
                            .text()
                            .trim();
                    }

                    // Push the scraped data to the array
                    articleData.push(data);
                }

            } catch (fetchError) {
                // Log and continue for each individual URL that fails to load
                console.error(`Error fetching ${currentUrl}: ${fetchError.message}`);
            }
        }

        crawlFinished = true;
        clearTimeout(timeout);
        res.status(200).json({ articles: articleData, keyword: keyword });
    } catch (error) {
        console.error('Error during crawling:', error.message);
        res.status(500).json({ error: 'Error occurred while scraping. Please try again later.' });
    }
};
