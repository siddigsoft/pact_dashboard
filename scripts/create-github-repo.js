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

async function createRepository() {
  try {
    const octokit = await getGitHubClient();
    
    // Get authenticated user
    const { data: user } = await octokit.users.getAuthenticated();
    console.log(`✅ Authenticated as: ${user.login}`);
    
    // Create new repository
    console.log('📦 Creating repository "PACT-Siddig"...');
    const { data: repo } = await octokit.repos.createForAuthenticatedUser({
      name: 'PACT-Siddig',
      description: 'PACT Workflow Platform - Comprehensive MMP Management System for field operations',
      private: false,
      auto_init: false
    });
    
    console.log(`✅ Repository created successfully!`);
    console.log(`📍 Repository URL: ${repo.html_url}`);
    console.log(`🔗 Clone URL: ${repo.clone_url}`);
    
    return {
      url: repo.html_url,
      cloneUrl: repo.clone_url,
      sshUrl: repo.ssh_url
    };
  } catch (error) {
    if (error.status === 422 && error.message.includes('already exists')) {
      console.log('⚠️  Repository "PACT-Siddig" already exists in your account');
      const octokit = await getGitHubClient();
      const { data: user } = await octokit.users.getAuthenticated();
      const repoUrl = `https://github.com/${user.login}/PACT-Siddig`;
      console.log(`📍 Repository URL: ${repoUrl}`);
      return {
        url: repoUrl,
        cloneUrl: `${repoUrl}.git`,
        existing: true
      };
    }
    throw error;
  }
}

createRepository()
  .then(result => {
    console.log('\n🎉 Success!');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
