exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = 'imdiekejordan/car-scraper';

  if (!GITHUB_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GitHub token not configured' }) };
  }

  try {
    // Check if a workflow is already running before triggering
    const runsResponse = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/scrape.yml/runs?status=in_progress&per_page=1`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    let shouldTrigger = true;
    if (runsResponse.ok) {
      const runsData = await runsResponse.json();
      if (runsData.workflow_runs && runsData.workflow_runs.length > 0) {
        return {
          statusCode: 200,
          body: JSON.stringify({ success: false, message: 'A scrape is already running. Please wait for it to complete.' })
        };
      }
    }

    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/scrape.yml/dispatches`, {
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

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to trigger workflow: ${response.status} ${errorText}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Scraper triggered successfully' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

