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

    try {
      for (; urlsToVisit.length > 0 && crawledCount < maxCrawlLength;) {
        const currentUrl = urlsToVisit.shift();
        crawledCount++;

        try {
          const response = await axios.get(currentUrl);
          const $ = cheerio.load(response.data);

          // Extract article data
          $('.gs_r.gs_or').each((_, element) => {
            const title = $(element).find('.gs_rt').text().trim();
            const link = $(element).find('.gs_rt a').attr('href');
            const abstract = $(element).find('.gs_rs').text().trim();

            if (title && link) {
              articleData.push({ title, url: link, abstract });
            }
          });

          // Find additional links to crawl
          $('a').each((_, el) => {
            const url = $(el).attr('href');
            if (url && url.startsWith('https://') && !urlsToVisit.includes(url)) {
              urlsToVisit.push(url);
            }
          });
        } catch (error) {
          console.error(`Error crawling ${currentUrl}: ${error.message}`);
        }
      }

      return res.status(200).json({ keyword, articles: articleData });
    } catch (error) {
      console.error('Error:', error.message);
      return res.status(500).json({ error: 'An error occurred during scraping.' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed.` });
  }
};
