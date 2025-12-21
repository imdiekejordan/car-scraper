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

    let closingTime = '';
    
    const pageTitle = $('title').text();
    const bodyText = $('body').text();
    
    const timeElements = $('[class*="time"]');
    let countdownText = '';
    timeElements.each((i, el) => {
      const text = $(el).text().trim();
      if (text.match(/^\d{2}:\d{2}:\d{2}$/)) {
        countdownText = text;
        return false;
      }
    });
    
    if (countdownText) {
      const [hours, minutes, seconds] = countdownText.split(':').map(Number);
      const now = new Date();
      const closing = new Date(now.getTime() + (hours * 3600 + minutes * 60 + seconds) * 1000);
      closingTime = closing.toISOString();
    } else {
      const endingMatch = pageTitle.match(/ENDING\s+(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)\s+(NIGHT|EVENING|MORNING|AFTERNOON)/i);
      if (endingMatch) {
        const dayName = endingMatch[1];
        const timeOfDay = endingMatch[2].toLowerCase();
        
        const now = new Date();
        const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const targetDay = daysOfWeek.indexOf(dayName.toLowerCase());
        const currentDay = now.getDay();
        
        let daysUntil = targetDay - currentDay;
        if (daysUntil <= 0) {
          daysUntil += 7;
        }
        
        const closing = new Date(now);
        closing.setDate(now.getDate() + daysUntil);
        
        if (timeOfDay === 'night' || timeOfDay === 'evening') {
          closing.setHours(23, 59, 59, 999);
        } else if (timeOfDay === 'morning') {
          closing.setHours(12, 0, 0, 0);
        } else {
          closing.setHours(18, 0, 0, 0);
        }
        
        closingTime = closing.toISOString();
      } else {
        const datePatterns = [
          /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/,
          /(Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov)\s+(\d{1,2})\s+(\d{1,2}):(\d{2})\s*(am|pm)/i,
          /(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)/i
        ];
        
        for (const pattern of datePatterns) {
          const match = bodyText.match(pattern);
          if (match) {
            try {
              const date = new Date(match[0]);
              if (!isNaN(date.getTime())) {
                closingTime = date.toISOString();
                break;
              }
            } catch (e) {
              continue;
            }
          }
        }
      }
    }

    return {
      url: url,
      itemName: itemName || 'Unknown Item',
      currentPrice: currentPrice,
      closingTime: closingTime || null,
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

