const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    // Display usage info for the API
    return res.status(200).json({
      message: 'Welcome to the web scraper API. Use POST /api with { keyword: "your_search_term" } to start scraping.',
    });
  }

  if (req.method === 'POST') {
    const { keyword } = req.body;

    if (!keyword) {
      return res.status(400).json({ error: 'Keyword is required.' });
    }

    const encodedKeyword = encodeURIComponent(keyword);
    let targetUrl = `https://scholar.google.com/scholar?hl=en&as_sdt=0%2C5&q=${encodedKeyword}&btnG=`;

    let urlsToVisit = [targetUrl];
    const maxCrawlLength = 20;
    let crawledCount = 0;
    const articleData = [];
    const visitedUrls = new Set();

    let crawlFinished = false;

    // Timeout logic: Return partial results after 30 seconds
    const timeout = setTimeout(() => {
      if (!crawlFinished) {
        console.log('Timeout reached, returning partial results.');
        res.status(200).json({ articles: articleData, keyword });
      }
    }, 30000);

    try {
      for (; urlsToVisit.length > 0 && crawledCount < maxCrawlLength;) {
        const currentUrl = urlsToVisit.shift();

        if (visitedUrls.has(currentUrl)) {
          continue;
        }

        visitedUrls.add(currentUrl);
        crawledCount++;

        try {
          const response = await axios.get(currentUrl, { timeout: 10000 });
          const $ = cheerio.load(response.data);

          const linkElements = $('a');
          linkElements.each((index, element) => {
            const url = $(element).attr('href');
            if (url && url.startsWith("https://") && !visitedUrls.has(url) && !url.includes("google") && !url.includes("download")) {
              urlsToVisit.push(url);
            }
          });

          if (crawledCount > 1) {
            const data = {};
            data.url = currentUrl;
            data.title = $('title').text().trim();

            if (currentUrl.includes('hal.science')) {
              const abstractText = $('div.abstract').text().trim();
              data.abstract = abstractText || 'Abstract not found';
            } else {
              data.abstract = $('*:contains("Abstract")')
                .filter((_, el) => $(el).text().trim() === "Abstract")
                .nextUntil(':header')
                .text()
                .trim();
            }

            articleData.push(data);
          }
        } catch (fetchError) {
          console.error(`Error fetching ${currentUrl}: ${fetchError.message}`);
        }
      }

      crawlFinished = true;
      clearTimeout(timeout);

      return res.status(200).json({ articles: articleData, keyword });

    } catch (error) {
      clearTimeout(timeout);
      console.error('Error during crawling:', error.message);
      return res.status(500).json({ error: 'Error occurred while scraping.' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed.` });
  }
};