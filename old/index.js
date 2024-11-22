// npm install axios cheerio
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
//const prompt = require('prompt-sync')();
var http = require('http');

http.createServer(function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });

    res.write('Title, Url, Abstract \n');

    // specify the URL of the site to crawl
    let targetUrl = 'https://scholar.google.com/';

    //const keyword = prompt('Enter Keyword?');
    console.log(req.url);

    targetUrl = `https://scholar.google.com/scholar?hl=en&as_sdt=0%2C5&q=${req.url.substring(1)}&btnG=`;

    // add the target URL to an array of URLs to visit
    let urlsToVisit = [targetUrl];

    // define the desired crawl limit
    const maxCrawlLength = 20;

    // to store scraped articleData
    const articleData = [];

    // define a crawler function
    const crawler = async () => {
        // track the number of crawled URLs
        let crawledCount = 0;

        for (; urlsToVisit.length > 0 && crawledCount <= maxCrawlLength;) {
            // get the next URL from the list
            const currentUrl = urlsToVisit.shift();
            // increment the crawl count
            crawledCount++;

            try {
                // request the target website
                const response = await axios.get(currentUrl);
                // parse the website's HTML
                const $ = cheerio.load(response.data);

                // find all links on the page
                const linkElements = $('a');
                linkElements.each((index, element) => {
                    let url = $(element).attr('href');

                    // follow links within the target website
                    if (url.startsWith("https://") && !urlsToVisit.includes(url) && !url.includes("google") && !url.includes("download")) {
                        // update the URLs to visit
                        urlsToVisit.push(url);
                    }
                });

                if (crawledCount > 1) {
                    const data = {};

                    data.url = currentUrl;

                    data.title = $('title').text();

                    //data.abstract = $('#articleAbstract > div').text() || $('#abspara0010 > span:nth-child(1)').text();
                    data.abstract = $('*:contains("Abstract")').filter((_, el) => $(el).text().trim() === "Abstract")
                    .nextUntil(':header') // Adjust selector if sibling structure differs
                    .text()
                    .trim();

                    res.write(data.title + " , " + data.url + " , " + data.abstract + '\n' + '\n');

                    // append the scraped data to the empty array
                    articleData.push(data);
                }

            } catch (error) {
                // handle any error that occurs during the HTTP request
                //console.error(`Error fetching ${currentUrl}: ${error.message}`);
            }
        }

        // write articleData to a CSV file
        const header = 'Title,Url,Abstract\n';
        const csvRows = articleData
            .map((item) => `${item.title}, ${item.url}, ${item.abstract}`)
            .join('\n');
        const csvData = header + csvRows;

        fs.writeFileSync('articles.csv', csvData);
        console.log('CSV file has been successfully created!');
        res.end();

        //console.log(urlsToVisit);
    };

    // execute the crawler function
    if(req.url != "/favicon.ico"){
        console.log("hello - " + req.url);
        crawler();
    }

}).listen(8080);
