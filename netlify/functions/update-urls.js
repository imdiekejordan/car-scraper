exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { urls } = JSON.parse(event.body);
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = 'imdiekejordan/car-scraper';

  if (!GITHUB_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GitHub token not configured' }) };
  }

  try {
    const json = JSON.stringify(urls, null, 2);
    const base64Content = Buffer.from(json).toString('base64');

    const getFileResponse = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/urls.json`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    let sha = null;
    if (getFileResponse.ok) {
      const fileData = await getFileResponse.json();
      sha = fileData.sha;
    }

    const commitResponse = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/urls.json`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Update URLs from web interface',
        content: base64Content,
        sha: sha
      })
    });

    if (!commitResponse.ok) {
      throw new Error('Failed to commit to GitHub');
    }

    // Trigger the workflow to scrape immediately
    const workflowResponse = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/scrape.yml/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref: 'main'
      })
    });

    if (!workflowResponse.ok) {
      const errorText = await workflowResponse.text();
      console.error('Failed to trigger workflow:', errorText);
      // Don't fail the whole request if workflow trigger fails
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'URLs updated and scraper triggered. Data will be available shortly.' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

