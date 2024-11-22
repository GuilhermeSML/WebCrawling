const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    if (req.method === 'POST') {
        let { keyword } = req.body;

        if (!keyword) {
            return res.status(400).json({ error: 'Keyword is required.' });
        }

        keyword = encodeURIComponent(keyword);
        const targetUrl = `https://scholar.google.com/scholar?hl=en&as_sdt=0%2C5&q=${keyword}&btnG=`;

        const articleData = [];
        let crawledCount = 0;
        let urlsToVisit = [targetUrl];
        const maxCrawlLength = 20;
        const visitedUrls = new Set();

        let crawlFinished = false;

        // Timeout logic
        const timeout = setTimeout(() => {
            if (!crawlFinished) {
                console.log('Timeout reached, sending partial results...');
                res.status(200).json({ keyword, articles: articleData });
            }
        }, 30000); // 30 seconds timeout

        try {
            for (; urlsToVisit.length > 0 && crawledCount < maxCrawlLength;) {
                const currentUrl = urlsToVisit.shift();

                // Skip already visited URLs
                if (visitedUrls.has(currentUrl)) continue;
                visitedUrls.add(currentUrl);

                crawledCount++;

                try {
                    // Crawl until the specified max crawl length is reached
                    for (; urlsToVisit.length > 0 && crawledCount < maxCrawlLength;) {
                        const currentUrl = urlsToVisit.shift();
            
                        // Skip already visited URLs
                        if (visitedUrls.has(currentUrl)) {
                            continue;  // Skip the iteration and move on to the next URL in the queue
                        }
            
                        // Mark the current URL as visited
                        visitedUrls.add(currentUrl);
            
                        crawledCount++;
            
                        try {
                            // Request the target website with a timeout of 10 seconds
                            const response = await axios.get(currentUrl, { timeout: 10000 }); // 10 seconds timeout
                            console.log(`Response received from ${currentUrl}`);
            
                            // Check if the response data contains anything useful
                            if (!response.data) {
                                console.error('No data received');
                            }
            
                            const $ = cheerio.load(response.data);
            
                            // Find all links on the page
                            const linkElements = $('a');
                            linkElements.each((index, element) => {
                                let url = $(element).attr('href');
            
                                // Follow valid links that do not lead to Google or download pages
                                if (url && url.startsWith("https://") && !visitedUrls.has(url) && !url.includes("google") && !url.includes("download")) {
                                    // Add the valid URLs to the list of URLs to visit
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
            
                    // Set crawlFinished to true and clear the timeout once the crawl is complete
                    crawlFinished = true;
                    clearTimeout(timeout);
            
                } catch (error) {
                    console.error('Error during crawling:', error.message);
                }
            }

            // Set crawlFinished to true and clear timeout
            crawlFinished = true;
            clearTimeout(timeout);

            // Return scraped data
            res.status(200).json({ keyword, articles: articleData });
        } catch (error) {
            console.error('Error during scraping:', error.message);
            res.status(500).json({ error: 'An error occurred during scraping.' });
        }
    } else {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `Method ${req.method} not allowed.` });
    }
};
