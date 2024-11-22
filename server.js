const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 8080;

// Serve static files (HTML, CSS, etc.)
app.use(express.static('public'));

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));

// Route for the home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route to handle form submission and crawl data
app.post('/scrape', async (req, res) => {
    const keyword = req.body.keyword;
    if (!keyword) {
        return res.send('Please enter a keyword to search.');
    }

    // URL encode the keyword to ensure proper query formation
    const encodedKeyword = encodeURIComponent(keyword);

    // Google Scholar search URL based on user input
    let targetUrl = `https://scholar.google.com/scholar?hl=en&as_sdt=0%2C5&q=${encodedKeyword}&btnG=`;

    // Initialize variables for crawling
    let urlsToVisit = [targetUrl];
    const maxCrawlLength = 20;  // Set the limit for the number of URLs to crawl
    let crawledCount = 0;
    const articleData = [];
    const visitedUrls = new Set(); // Set to track visited URLs

    // Variable to track if the crawl has finished
    let crawlFinished = false;

    // Timeout after 30 seconds
    const timeout = setTimeout(() => {
        if (!crawlFinished) {
            // If the crawl is not finished in 30 seconds, render the current results
            console.log('Timeout reached, sending partial results...');
            res.render('results', { articles: articleData, keyword: keyword });
        }
    }, 30000); // 30 seconds timeout

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

        // After the crawl, render the results page with scraped data
        res.render('results', { articles: articleData, keyword: keyword });

    } catch (error) {
        console.error('Error during crawling:', error.message);
        res.send('Error occurred while scraping. Please try again later.');
    }
});

// Set EJS as the view engine
app.set('view engine', 'ejs');

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
