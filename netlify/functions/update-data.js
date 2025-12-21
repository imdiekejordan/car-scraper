exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { items, removeUrl } = JSON.parse(event.body);
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = 'imdiekejordan/car-scraper';

  if (!GITHUB_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GitHub token not configured' }) };
  }

  try {
    // Get current data.json
    const getFileResponse = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/data.json`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    let currentData = { lastUpdated: new Date().toISOString(), items: [] };
    let sha = null;

    if (getFileResponse.ok) {
      const fileData = await getFileResponse.json();
      sha = fileData.sha;
      const content = Buffer.from(fileData.content, 'base64').toString('utf8');
      currentData = JSON.parse(content);
    }

    // If removing a URL, filter it out
    if (removeUrl) {
      currentData.items = currentData.items.filter(item => item.url !== removeUrl);
    } else if (items && items.length > 0) {
      // Update or add items
      const updatedUrls = new Set(items.map(item => item.url));
      
      // Remove old items with these URLs
      currentData.items = currentData.items.filter(item => !updatedUrls.has(item.url));
      
      // Add new/updated items
      currentData.items.push(...items);
    }

    // Update lastUpdated timestamp
    currentData.lastUpdated = new Date().toISOString();

    const json = JSON.stringify(currentData, null, 2);
    const base64Content = Buffer.from(json).toString('base64');

    const commitResponse = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/data.json`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: removeUrl ? `Remove URL: ${removeUrl}` : 'Update data from web interface',
        content: base64Content,
        sha: sha
      })
    });

    if (!commitResponse.ok) {
      const errorText = await commitResponse.text();
      throw new Error(`Failed to commit to GitHub: ${errorText}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Data updated successfully' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

