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
    const maxCrawlLength = 3; // Limit the number of crawled pages for quicker results
    let crawledCount = 0;
    const articleData = [];
    const visitedUrls = new Set();

    try {
        // Function to send partial response
        const sendPartialResponse = () => {
            // Send any progress so far after each batch of pages
            res.write(JSON.stringify({ articles: articleData, keyword: keyword }));
        };

        // Loop through the URLs to scrape
        while (urlsToVisit.length > 0 && crawledCount < maxCrawlLength) {
            const currentUrl = urlsToVisit.shift();

            if (visitedUrls.has(currentUrl)) continue;
            visitedUrls.add(currentUrl);
            crawledCount++;

            try {
                const response = await axios.get(currentUrl, {
                    timeout: 8000, // Timeout for each individual request (8 seconds)
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });

                if (!response.data) {
                    console.error(`No data received for ${currentUrl}`);
                    continue;
                }

                const $ = cheerio.load(response.data);
                const newUrls = [];

                // Collect new links from the current page
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
                    url: currentUrl,
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
                articleData.push(data);

                // Send partial response after each page is processed (or after a batch of pages)
                sendPartialResponse();

                // Optionally, delay between pages to avoid overwhelming external servers
                await new Promise(resolve => setTimeout(resolve, 1000));  // 1-second delay

            } catch (fetchError) {
                console.error(`Error fetching ${currentUrl}: ${fetchError.message}`);
            }
        }

        // Finish the response once all pages are crawled
        res.end();  // End the stream after sending all partial responses

    } catch (error) {
        console.error('Error during crawling:', error.message);
        res.status(500).json({ error: 'Error occurred while scraping. Please try again later.' });
    }
};
