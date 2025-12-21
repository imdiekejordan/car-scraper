# Troubleshooting Guide

## How to Debug Workflow Failures

### 1. Check GitHub Actions Logs
1. Go to your repository on GitHub
2. Click on the **Actions** tab
3. Click on the failed workflow run (red X icon)
4. Click on the **scrape** job
5. Expand the **Run scraper** step to see the error messages

### 2. Common Issues to Check

#### Issue: "Error: Could not fetch"
- **Cause**: Network timeout or K-Bid server blocking requests
- **Solution**: The scraper has retry logic (3 attempts), but if all fail, it will log the error

#### Issue: "SyntaxError" or "ReferenceError"
- **Cause**: Code syntax error
- **Solution**: Test locally first with `node scraper.js`

#### Issue: "ENOENT: no such file or directory"
- **Cause**: Missing `urls.json` file
- **Solution**: The scraper has fallback URLs, but ensure `urls.json` exists

#### Issue: Workflow times out
- **Cause**: Too many URLs or slow network
- **Solution**: Check the timeout settings in `.github/workflows/scrape.yml`

### 3. Test Locally

```bash
# Test the scraper
node scraper.js

# Check if data.json was created
cat data.json

# Check Node.js version (should be 20+)
node --version
```

### 4. Check Workflow Configuration

Verify these settings in `.github/workflows/scrape.yml`:
- Node.js version: `node-version: '20'`
- Timeout: Check if `timeout-minutes` is set
- Continue on error: Check `continue-on-error` setting

### 5. Enable Verbose Logging

The scraper now includes detailed logging:
- `[1/5] Scraping: [URL]` - Shows progress
- `✓ Successfully scraped: [Item Name]` - Success messages
- `✗ Error scraping [URL]: [Error]` - Error messages with stack traces

### 6. Check Network Issues

If all URLs fail:
- K-Bid might be blocking GitHub Actions IPs
- Check if K-Bid website is accessible
- Verify User-Agent headers are correct

### 7. Verify URLs

Check `urls.json`:
```bash
cat urls.json
```

Ensure URLs are valid and accessible.

### 8. Check Data File

After a run, check `data.json`:
- Does it exist?
- Is it valid JSON?
- Does it contain the expected fields?

### 9. Manual Workflow Trigger

1. Go to Actions tab
2. Click "Scrape K-Bid Auctions" workflow
3. Click "Run workflow" button
4. Select branch (usually "main")
5. Click "Run workflow"
6. Watch the logs in real-time

### 10. Compare Working vs Failing Runs

1. Find a successful run (green checkmark)
2. Compare its logs with a failed run
3. Look for differences in:
   - Node.js version
   - Dependencies installed
   - Error messages
   - Timing

## Quick Fixes

### If scraper keeps failing:
1. **Revert to last working version**: `git log` to find last successful commit
2. **Test locally first**: Always test with `node scraper.js` before pushing
3. **Check logs**: The detailed logging will show exactly where it fails
4. **Simplify**: Remove problematic URLs temporarily to isolate the issue

### If workflow times out:
- Increase timeout in workflow file
- Reduce number of URLs
- Check if K-Bid is responding slowly

### If data.json isn't updating:
- Check if workflow is actually running (scheduled runs)
- Verify git push permissions
- Check if there are merge conflicts

