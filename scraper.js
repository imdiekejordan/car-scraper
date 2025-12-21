const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

let urls = [];
try {
  const urlsPath = path.join(__dirname, 'urls.json');
  if (fs.existsSync(urlsPath)) {
    urls = JSON.parse(fs.readFileSync(urlsPath, 'utf8'));
  } else {
    urls = [
      'https://www.k-bid.com/auction/62603/item/8',
      'https://www.k-bid.com/auction/62603/item/14',
      'https://www.k-bid.com/auction/62603/item/18',
      'https://www.k-bid.com/auction/62481/item/4',
      'https://www.k-bid.com/auction/62483/item/4'
    ];
  }
} catch (error) {
  console.error('Error loading urls.json:', error.message);
  urls = [
    'https://www.k-bid.com/auction/62603/item/8',
    'https://www.k-bid.com/auction/62603/item/14',
    'https://www.k-bid.com/auction/62603/item/18',
    'https://www.k-bid.com/auction/62481/item/4',
    'https://www.k-bid.com/auction/62483/item/4'
  ];
}

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function scrapeItem(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 30000
    });

    const $ = cheerio.load(response.data);
    
    let itemName = '';
    const ogTitle = $('meta[property="og:title"]').attr('content');
    if (ogTitle && ogTitle.trim().length > 0) {
      itemName = ogTitle.trim();
    } else {
      const titleElements = $('[class*="title"]');
      for (let i = 0; i < titleElements.length; i++) {
        const text = $(titleElements[i]).text().trim();
        if (text && text.length > 0 && !text.match(/^\d{2}:\d{2}:\d{2}$/) && !text.match(/^Lot\s*#/i)) {
          itemName = text;
          break;
        }
      }
    }
    
    if (!itemName || itemName.length === 0) {
      const pageTitle = $('title').text().trim();
      itemName = pageTitle.split('|')[0].trim() || 'Unknown Item';
    }

    let currentPrice = '';
    const priceSelectors = [
      '[class*="price"]',
      '[class*="bid"]',
      '[class*="current"]',
      '[id*="price"]',
      '[id*="bid"]',
      'strong:contains("$")',
      '.price',
      '.bid-price',
      '.current-bid'
    ];
    
    for (const selector of priceSelectors) {
      const found = $(selector).first().text().trim();
      const priceMatch = found.match(/\$[\d,]+\.?\d*/);
      if (priceMatch) {
        currentPrice = priceMatch[0];
        break;
      }
    }
    
    if (!currentPrice) {
      const bodyText = $('body').text();
      const priceMatch = bodyText.match(/\$[\d,]+\.?\d*/);
      if (priceMatch) {
        currentPrice = priceMatch[0];
      }
    }
    
    if (!currentPrice) {
      currentPrice = 'N/A';
    }

    return {
      url: url,
      itemName: itemName || 'Unknown Item',
      currentPrice: currentPrice,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error scraping ${url}:`, error.message);
    return {
      url: url,
      itemName: 'Error: Could not fetch',
      currentPrice: 'N/A',
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}

async function scrapeAll() {
  const timestamp = new Date().toISOString();
  const results = [];
  
  for (const url of urls) {
    const item = await scrapeItem(url);
    results.push(item);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const data = {
    lastUpdated: timestamp,
    items: results
  };
  
  const outputPath = path.join(__dirname, 'data.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  
  return data;
}

// Run if called directly
if (require.main === module) {
  scrapeAll().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { scrapeAll };

