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
    
    // Fallback: try to find by ID pattern
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
    
    // Find all lot fees - look for fee section with "Applicable Lot Fees"
    const feeSection = $('[id*="lot_fees"], [class*="lot"], [class*="fee"]').filter((i, el) => {
      const text = $(el).text().toLowerCase();
      return text.includes('applicable lot fee') || (text.includes('fee name') && text.includes('amount') && text.includes('type'));
    });
    
    if (feeSection.length > 0) {
      // Find the parent container that has the fee list
      const feeContainer = feeSection.first().parent().length > 0 ? feeSection.first().parent() : feeSection.first();
      const bidAmount = parseFloat(currentPrice.replace(/[$,]/g, '')) || 0;
      
      // Look for rows that contain fees (both flat and percentage)
      feeContainer.find('div.row, tr').each((i, el) => {
        const rowText = $(el).text();
        const lowerText = rowText.toLowerCase();
        
        // Skip header rows
        if (lowerText.includes('fee name') && lowerText.includes('amount') && lowerText.includes('type')) {
          return;
        }
        
        // Process flat fees
        if (lowerText.includes('flat')) {
          const dollarMatch = rowText.match(/\$?([\d,]+\.?\d*)/);
          if (dollarMatch) {
            const feeValue = parseFloat(dollarMatch[1].replace(/,/g, ''));
            // Only add reasonable fee amounts (typically $10-$500 for lot fees)
            if (feeValue > 0 && feeValue <= 1000 && !lowerText.includes('premium') && !lowerText.includes('buyer')) {
              lotFees += feeValue;
            }
          }
        }
        
        // Process percentage fees (like sales tax)
        if (lowerText.includes('percent') && bidAmount > 0) {
          const percentMatch = rowText.match(/(\d+(?:\.\d+)?)\s*%/);
          if (percentMatch) {
            const percent = parseFloat(percentMatch[1]);
            // Only process reasonable percentages (typically 1-20% for taxes/fees, not buyer's premium)
            if (percent > 0 && percent <= 20 && !lowerText.includes('premium') && !lowerText.includes('buyer')) {
              const calculatedFee = (bidAmount * percent / 100);
              lotFees += calculatedFee;
            }
          }
        }
      });
    }
    
    // Fallback: if no fees found in structured format, try pattern matching
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
    
    // If no fees found in table, try pattern matching on entire body
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
    
    // Find buyer's premium (percentage-based fee)
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
    
    // If buyer's premium not found, look for percentage fees in fee section
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
    
    // Fallback: look for any percentage that might be buyer's premium
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

async function scrapeAll() {
  try {
    const timestamp = new Date().toISOString();
    
    // Process URLs in parallel with concurrency limit (3 at a time to avoid rate limiting)
    const concurrency = 3;
    const results = [];
    
    if (!urls || urls.length === 0) {
      console.warn('No URLs to scrape');
      return {
        lastUpdated: timestamp,
        items: []
      };
    }
    
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      console.log(`Processing batch ${Math.floor(i / concurrency) + 1} (${batch.length} URLs)`);
      
      try {
        const batchResults = await Promise.allSettled(
          batch.map(url => scrapeItem(url))
        );
        
        // Process results - use fulfilled values or error objects
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            // If a promise was rejected, create an error entry
            console.error(`Failed to scrape ${batch[index]}:`, result.reason);
            results.push({
              url: batch[index],
              itemName: 'Error: Could not fetch',
              currentPrice: 'N/A',
              timestamp: new Date().toISOString(),
              error: result.reason?.message || result.reason?.toString() || 'Unknown error'
            });
          }
        });
      } catch (batchError) {
        console.error(`Error processing batch:`, batchError);
        // Add error entries for the entire batch
        batch.forEach(url => {
          results.push({
            url: url,
            itemName: 'Error: Could not fetch',
            currentPrice: 'N/A',
            timestamp: new Date().toISOString(),
            error: batchError?.message || 'Batch processing error'
          });
        });
      }
      
      // Small delay between batches to be respectful
      if (i + concurrency < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    const data = {
      lastUpdated: timestamp,
      items: results
    };
    
    const outputPath = path.join(__dirname, 'data.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`Successfully saved ${results.length} items to data.json`);
    
    return data;
  } catch (error) {
    console.error('Error in scrapeAll:', error);
    // Return empty data structure so workflow can continue
    const fallbackData = {
      lastUpdated: new Date().toISOString(),
      items: []
    };
    try {
      const outputPath = path.join(__dirname, 'data.json');
      fs.writeFileSync(outputPath, JSON.stringify(fallbackData, null, 2));
    } catch (writeError) {
      console.error('Could not write fallback data:', writeError);
    }
    throw error; // Re-throw to be caught by caller
  }
}

// Run if called directly
if (require.main === module) {
  scrapeAll()
    .then(data => {
      console.log(`Successfully scraped ${data.items.length} items`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      // Try to save partial results if we have any
      try {
        const outputPath = path.join(__dirname, 'data.json');
        if (fs.existsSync(outputPath)) {
          console.log('Previous data file exists, keeping it');
        } else {
          // Create empty data file so workflow doesn't fail completely
          const emptyData = {
            lastUpdated: new Date().toISOString(),
            items: []
          };
          fs.writeFileSync(outputPath, JSON.stringify(emptyData, null, 2));
          console.log('Created empty data file');
        }
      } catch (writeError) {
        console.error('Could not write data file:', writeError);
      }
      process.exit(0); // Exit with 0 so workflow continues
    });
}

module.exports = { scrapeAll };

