# Connect Existing Netlify Site to New GitHub Repository

## Steps to Change GitHub Repository in Netlify

1. **Go to Netlify Dashboard**
   - Log in at https://app.netlify.com
   - Find your existing site and click on it

2. **Access Site Settings**
   - Click **Site settings** (or the gear icon)
   - In the left sidebar, click **Build & deploy**

3. **Change Connected Repository**
   - Under **Continuous Deployment**, you'll see your current connected repository
   - Click **Link to a different branch** or **Change site source**
   - Select **GitHub** as your Git provider
   - Authorize Netlify if needed
   - Search for and select your new repository: `imdiekejordan/car-scraper`
   - Click **Save**

4. **Configure Build Settings** (if needed)
   - Build command: (leave empty)
   - Publish directory: `/` (root)
   - Click **Save**

5. **Trigger New Deploy**
   - Netlify should automatically detect the new repository
   - You can also manually trigger a deploy by going to **Deploys** tab and clicking **Trigger deploy** → **Deploy site**

## Alternative: Disconnect and Reconnect

If the above doesn't work:

1. Go to **Site settings** → **Build & deploy** → **Continuous Deployment**
2. Click **Unlink** next to your current repository
3. Click **Link to a Git provider**
4. Select **GitHub**
5. Choose your repository: `imdiekejordan/car-scraper`
6. Configure build settings and save

Your existing Netlify URL will remain the same - it will just pull from the new GitHub repository!

