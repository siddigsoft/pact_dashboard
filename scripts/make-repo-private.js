import { Octokit } from '@octokit/rest';

let connectionSettings;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function getGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

async function makeRepositoryPrivate() {
  try {
    const octokit = await getGitHubClient();
    
    // Get authenticated user
    const { data: user } = await octokit.users.getAuthenticated();
    console.log(`✅ Authenticated as: ${user.login}`);
    
    // Update repository to private
    console.log('🔒 Updating repository "PACT-Siddig" to private...');
    const { data: repo } = await octokit.repos.update({
      owner: user.login,
      repo: 'PACT-Siddig',
      private: true
    });
    
    console.log(`✅ Repository is now private!`);
    console.log(`📍 Repository URL: ${repo.html_url}`);
    console.log(`🔒 Visibility: ${repo.private ? 'Private' : 'Public'}`);
    
    return {
      url: repo.html_url,
      private: repo.private
    };
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

makeRepositoryPrivate()
  .then(result => {
    console.log('\n🎉 Success!');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('❌ Failed to update repository:', error.message);
    process.exit(1);
  });
