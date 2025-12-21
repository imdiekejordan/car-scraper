const axios = require('axios');
const cheerio = require('cheerio');

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function scrapeItem(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
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
        timeout: 60000
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
      
      // Extract next required bid
      let nextRequiredBid = null;
      const nextBidElement = $('h4:contains("Next Required Bid")');
      if (nextBidElement.length > 0) {
        const nextBidText = nextBidElement.text();
        const nextBidMatch = nextBidText.match(/\$?([\d,]+\.?\d*)/);
        if (nextBidMatch) {
          nextRequiredBid = '$' + parseFloat(nextBidMatch[1].replace(/,/g, '')).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
      }
      
      if (!nextRequiredBid) {
        const nextBidById = $('[id*="next_required_bid"]');
        if (nextBidById.length > 0) {
          const nextBidText = nextBidById.text().trim();
          const nextBidMatch = nextBidText.match(/\$?([\d,]+\.?\d*)/);
          if (nextBidMatch) {
            nextRequiredBid = '$' + parseFloat(nextBidMatch[1].replace(/,/g, '')).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          }
        }
      }
      
      if (!nextRequiredBid) {
        nextRequiredBid = 'N/A';
      }

      let lotFees = 0;
      let buyersPremium = 0;
      
      const bodyText = $('body').text();
      const pageTitle = $('title').text();
      
      const feeSection = $('[id*="lot_fees"], [class*="lot"], [class*="fee"]').filter((i, el) => {
        const text = $(el).text().toLowerCase();
        return text.includes('applicable lot fee') || (text.includes('fee name') && text.includes('amount') && text.includes('type'));
      });
      
      if (feeSection.length > 0) {
        const feeContainer = feeSection.first().parent().length > 0 ? feeSection.first().parent() : feeSection.first();
        const bidAmount = parseFloat(currentPrice.replace(/[$,]/g, '')) || 0;
        
        feeContainer.find('div.row, tr').each((i, el) => {
          const rowText = $(el).text();
          const lowerText = rowText.toLowerCase();
          
          if (lowerText.includes('fee name') && lowerText.includes('amount') && lowerText.includes('type')) {
            return;
          }
          
          if (lowerText.includes('flat')) {
            const dollarMatch = rowText.match(/\$?([\d,]+\.?\d*)/);
            if (dollarMatch) {
              const feeValue = parseFloat(dollarMatch[1].replace(/,/g, ''));
              if (feeValue > 0 && feeValue <= 1000 && !lowerText.includes('premium') && !lowerText.includes('buyer')) {
                lotFees += feeValue;
              }
            }
          }
          
          if (lowerText.includes('percent') && bidAmount > 0) {
            const percentMatch = rowText.match(/(\d+(?:\.\d+)?)\s*%/);
            if (percentMatch) {
              const percent = parseFloat(percentMatch[1]);
              if (percent > 0 && percent <= 20 && !lowerText.includes('premium') && !lowerText.includes('buyer')) {
                const calculatedFee = (bidAmount * percent / 100);
                lotFees += calculatedFee;
              }
            }
          }
        });
      }
      
      if (lotFees === 0) {
        const feePatterns = [
          /applicable\s*lot\s*fee[:\s]*\$?([\d,]+\.?\d*)/i,
          /lot\s*fee[:\s]*\$?([\d,]+\.?\d*)/i
        ];
        
        for (const pattern of feePatterns) {
          const matches = [...bodyText.matchAll(pattern)];
          for (const match of matches) {
            const feeValue = parseFloat(match[1].replace(/,/g, ''));
            if (feeValue > 0 && feeValue <= 1000) {
              lotFees += feeValue;
            }
          }
        }
      }
      
      if (lotFees === 0) {
        const feePatterns = [
          /applicable\s*lot\s*fee[:\s]*\$?([\d,]+\.?\d*)/i,
          /lot\s*fee[:\s]*\$?([\d,]+\.?\d*)/i
        ];
        
        for (const pattern of feePatterns) {
          const matches = [...bodyText.matchAll(pattern)];
          for (const match of matches) {
            const feeValue = parseFloat(match[1].replace(/,/g, ''));
            if (feeValue > 0 && feeValue < 10000) {
              lotFees += feeValue;
            }
          }
        }
      }
      
      const premiumPatterns = [
        /buyer['']?s?\s*premium[:\s]*(\d+(?:\.\d+)?)\s*%/i,
        /(\d+(?:\.\d+)?)\s*%\s*buyer['']?s?\s*premium/i
      ];
      
      for (const pattern of premiumPatterns) {
        const match = bodyText.match(pattern);
        if (match && match[1]) {
          const percent = parseFloat(match[1]);
          const bidAmount = parseFloat(currentPrice.replace(/[$,]/g, '')) || 0;
          if (percent > 0 && percent < 100 && bidAmount > 0) {
            buyersPremium = (bidAmount * percent / 100);
            break;
          }
        }
      }
      
      if (buyersPremium === 0 && feeSection.length > 0) {
        const tableText = feeSection.text();
        const percentPattern = /(\d+(?:\.\d+)?)\s*%/g;
        const percentMatches = [...tableText.matchAll(percentPattern)];
        
        for (const match of percentMatches) {
          const percent = parseFloat(match[1]);
          const context = tableText.substring(Math.max(0, match.index - 50), match.index + 50).toLowerCase();
          if (percent >= 3 && percent <= 20 && (context.includes('premium') || context.includes('buyer') || context.includes('bid'))) {
            const bidAmount = parseFloat(currentPrice.replace(/[$,]/g, '')) || 0;
            if (bidAmount > 0) {
              buyersPremium = (bidAmount * percent / 100);
              break;
            }
          }
        }
      }
      
      if (buyersPremium === 0) {
        const allPercentages = [...bodyText.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
        for (const match of allPercentages) {
          const percent = parseFloat(match[1]);
          if (percent >= 10 && percent <= 20) {
            const context = bodyText.substring(Math.max(0, match.index - 100), match.index + 100).toLowerCase();
            if (context.includes('buyer') && context.includes('premium')) {
              const bidAmount = parseFloat(currentPrice.replace(/[$,]/g, '')) || 0;
              if (bidAmount > 0) {
                buyersPremium = (bidAmount * percent / 100);
                break;
              }
            }
          }
        }
      }

      let closingTime = '';
      
      // Search in multiple places for countdown timer
      const bodyText = $('body').text();
      let countdownText = '';
      let days = 0;
      
      // First, try to find in time-related elements (more comprehensive search)
      const timeElements = $('[class*="time"], [id*="time"], [class*="countdown"], [id*="countdown"], [class*="timer"], [id*="timer"], [class*="clock"], [id*="clock"]');
      timeElements.each((i, el) => {
        const text = $(el).text().trim();
        
        // Try to match formats with days: "1d 12:34:56" or "1 day 12:34:56"
        const dayMatch = text.match(/(\d+)\s*d(?:ay)?s?\s+(\d{1,2}):(\d{2}):(\d{2})/i);
        if (dayMatch) {
          days = parseInt(dayMatch[1], 10);
          countdownText = `${dayMatch[2]}:${dayMatch[3]}:${dayMatch[4]}`;
          return false;
        }
        
        // Try to match hours > 24: "25:34:56" (25 hours = 1 day 1 hour)
        // Also handles "123:45:67" format (multiple days worth of hours)
        const longHoursMatch = text.match(/^(\d{2,}):(\d{2}):(\d{2})$/);
        if (longHoursMatch) {
          const totalHours = parseInt(longHoursMatch[1], 10);
          days = Math.floor(totalHours / 24);
          const remainingHours = totalHours % 24;
          countdownText = `${String(remainingHours).padStart(2, '0')}:${longHoursMatch[2]}:${longHoursMatch[3]}`;
          return false;
        }
        
        // Standard format: "12:34:56" or "1:23:45" (single digit hour)
        const timeMatch = text.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
        if (timeMatch) {
          countdownText = text;
          return false;
        }
      });
      
      // If not found in elements, search more aggressively in body text
      if (!countdownText) {
        // Try to match formats with days in body text: "1d 12:34:56"
        const dayMatch = bodyText.match(/(\d+)\s*d(?:ay)?s?\s+(\d{1,2}):(\d{2}):(\d{2})/i);
        if (dayMatch) {
          days = parseInt(dayMatch[1], 10);
          countdownText = `${dayMatch[2]}:${dayMatch[3]}:${dayMatch[4]}`;
        } else {
          // Try to match any HH:MM:SS pattern in body text (more aggressive)
          // This will find the first time pattern that looks like a countdown
          const allTimeMatches = bodyText.match(/(\d{1,2}):(\d{2}):(\d{2})/g);
          if (allTimeMatches && allTimeMatches.length > 0) {
            // Use the first match that looks like a countdown (not a clock time)
            for (const match of allTimeMatches) {
              const [hours, minutes, seconds] = match.split(':').map(Number);
              // If it's a reasonable countdown (hours < 100, minutes < 60, seconds < 60)
              if (hours < 100 && minutes < 60 && seconds < 60) {
                countdownText = match;
                // Check if hours >= 24, convert to days
                if (hours >= 24) {
                  days = Math.floor(hours / 24);
                  const remainingHours = hours % 24;
                  countdownText = `${String(remainingHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                }
                break;
              }
            }
          }
        }
      }
      
      if (countdownText) {
        const [hours, minutes, seconds] = countdownText.split(':').map(Number);
        const now = new Date();
        const closing = new Date(now.getTime() + (days * 24 * 3600 + hours * 3600 + minutes * 60 + seconds) * 1000);
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
        nextRequiredBid: nextRequiredBid,
        lotFees: lotFees,
        buyersPremium: buyersPremium,
        closingTime: closingTime || null,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      if (attempt === retries) {
        console.error(`Error scraping ${url} after ${retries} attempts:`, error.message);
        return {
          url: url,
          itemName: 'Error: Could not fetch',
          currentPrice: 'N/A',
          timestamp: new Date().toISOString(),
          error: error.message
        };
      }
      console.log(`Attempt ${attempt} failed for ${url}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { urls: urlsToScrape } = JSON.parse(event.body);
    
    if (!Array.isArray(urlsToScrape) || urlsToScrape.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'URLs array is required' })
      };
    }

    const results = [];
    for (const url of urlsToScrape) {
      const item = await scrapeItem(url);
      results.push(item);
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, items: results })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

