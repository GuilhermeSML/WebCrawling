const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: `Method ${req.method} not allowed.` });
    }

    const { keyword } = req.body;
    if (!keyword) {
        return res.status(400).json({ error: 'Keyword is required.' });
    }

    const encodedKeyword = encodeURIComponent(keyword);
    const targetUrl = `https://scholar.google.com/scholar?hl=en&as_sdt=0%2C5&q=${encodedKeyword}&btnG=`;

    const articleData = [];
    let crawledCount = 0;
    const maxCrawlLength = 20;
    const visitedUrls = new Set();
    let urlsToVisit = [targetUrl];

    // Variable to track if the crawl has finished
    let crawlFinished = false;

    // Timeout to prevent infinite spinning
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
                const response = await axios.get(currentUrl, { timeout: 10000 }); // 10-second timeout for each fetch
                const $ = cheerio.load(response.data);

                // Log the fetched HTML for debugging purposes
                console.log(`Fetched HTML from: ${currentUrl}`);
                console.log(response.data); // <-- Log the full HTML to see the structure

                // Extract links for future visits
                $('a').each((_, el) => {
                    const url = $(el).attr('href');
                    if (url && url.startsWith('https://') && !visitedUrls.has(url)) {
                        urlsToVisit.push(url);
                    }
                });

                // Extract data for articles from the first page
                if (crawledCount === 1) {
                    // Specific Google Scholar scraping logic
                    $('.gs_r.gs_or').each((_, element) => {
                        const title = $(element).find('.gs_rt a').text().trim();
                        const link = $(element).find('.gs_rt a').attr('href');
                        const abstract = $(element).find('.gs_rs').text().trim();

                        if (title && link) {
                            articleData.push({ title, url: link, abstract });
                        }
                    });
                } else {
                    // General scraping logic for title and abstract
                    const title = $('title').text().trim();
                    let abstract = '';

                    // Check for an abstract
                    const abstractElement = $('*:contains("Abstract")')
                        .filter((_, el) => $(el).text().trim() === "Abstract")
                        .nextUntil(':header')
                        .text()
                        .trim();

                    // Fallback if abstract is not found
                    if (abstractElement) {
                        abstract = abstractElement;
                    } else {
                        abstract = $('meta[name="description"]').attr('content') || "Abstract not found";
                    }

                    // If no abstract or title found, log the issue
                    if (!title || !abstract) {
                        console.log(`No title or abstract found for: ${currentUrl}`);
                    }

                    articleData.push({
                        title: title || "Title not found",
                        url: currentUrl,
                        abstract: abstract || "Abstract not found",
                    });
                }
            } catch (fetchError) {
                console.error(`Error fetching ${currentUrl}: ${fetchError.message}`);
            }
        }

        crawlFinished = true;
        clearTimeout(timeout);

        // Send the results as JSON
        res.status(200).json({ keyword, articles: articleData });
    } catch (error) {
        console.error('Error during scraping:', error.message);
        res.status(500).json({ error: 'An error occurred during scraping.' });
    }
};
