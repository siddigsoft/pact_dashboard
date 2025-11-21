#!/usr/bin/env node

/**
 * Upload Documentation Files to GitHub via API
 * This bypasses git corruption issues by using GitHub's REST API
 */

import { Octokit } from '@octokit/rest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_OWNER = 'siddigsoft';
const REPO_NAME = 'PACT-Siddig';
const BRANCH = 'main';

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

// Files to upload
const filesToUpload = [
  {
    path: 'UI_DESIGN_ANALYSIS.md',
    localPath: 'UI_DESIGN_ANALYSIS.md',
    message: 'Add comprehensive UI design analysis report'
  },
  {
    path: 'UI_DESIGN_DEEP_DIVE.md',
    localPath: 'UI_DESIGN_DEEP_DIVE.md',
    message: 'Add technical deep dive UI analysis'
  },
  {
    path: 'DOCUMENTATION_INDEX.md',
    localPath: 'DOCUMENTATION_INDEX.md',
    message: 'Add master documentation index'
  },
  {
    path: 'GITHUB_REPOSITORY_INSTRUCTIONS.md',
    localPath: 'GITHUB_REPOSITORY_INSTRUCTIONS.md',
    message: 'Add GitHub repository setup instructions'
  },
  {
    path: 'MANUAL_GITHUB_UPDATE_GUIDE.md',
    localPath: 'MANUAL_GITHUB_UPDATE_GUIDE.md',
    message: 'Add manual GitHub update guide'
  },
  {
    path: 'scripts/create-github-repo.js',
    localPath: 'scripts/create-github-repo.js',
    message: 'Add GitHub repository creation script'
  },
  {
    path: 'scripts/make-repo-private.js',
    localPath: 'scripts/make-repo-private.js',
    message: 'Add repository privacy configuration script'
  },
  {
    path: 'scripts/push-to-pact-siddig.sh',
    localPath: 'scripts/push-to-pact-siddig.sh',
    message: 'Add helper script for pushing to repository'
  },
  {
    path: 'update-github-repo.sh',
    localPath: 'update-github-repo.sh',
    message: 'Add one-click repository update script'
  }
];

async function uploadFile(octokit, file) {
  try {
    console.log(`\n📤 Uploading: ${file.path}`);
    
    // Read file content
    const content = readFileSync(resolve(file.localPath), 'utf8');
    const contentEncoded = Buffer.from(content).toString('base64');
    
    // Check if file already exists
    let sha;
    try {
      const { data } = await octokit.repos.getContent({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: file.path,
        ref: BRANCH
      });
      sha = data.sha;
      console.log(`   ℹ️  File exists, will update (SHA: ${sha.substring(0, 7)})`);
    } catch (error) {
      if (error.status === 404) {
        console.log(`   ℹ️  File doesn't exist, will create`);
      } else {
        throw error;
      }
    }
    
    // Create or update file
    const response = await octokit.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: file.path,
      message: file.message,
      content: contentEncoded,
      branch: BRANCH,
      ...(sha && { sha }) // Include SHA if updating existing file
    });
    
    console.log(`   ✅ Success! Commit: ${response.data.commit.sha.substring(0, 7)}`);
    return true;
    
  } catch (error) {
    console.error(`   ❌ Error uploading ${file.path}:`, error.message);
    if (error.status === 404) {
      console.error(`   Make sure the repository exists and you have write access.`);
    }
    return false;
  }
}

async function main() {
  console.log('🚀 GitHub Documentation Uploader\n');
  console.log(`Repository: ${REPO_OWNER}/${REPO_NAME}`);
  console.log(`Branch: ${BRANCH}`);
  console.log(`Files to upload: ${filesToUpload.length}\n`);
  console.log('=' .repeat(60));
  
  // Initialize Octokit with GitHub integration
  const octokit = await getGitHubClient();
  
  // Verify authentication
  const { data: user } = await octokit.users.getAuthenticated();
  console.log(`\n✅ Authenticated as: ${user.login}`);
  
  // Upload all files
  let successCount = 0;
  let failCount = 0;
  
  for (const file of filesToUpload) {
    const success = await uploadFile(octokit, file);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Upload Summary:');
  console.log(`   ✅ Successful: ${successCount}/${filesToUpload.length}`);
  if (failCount > 0) {
    console.log(`   ❌ Failed: ${failCount}/${filesToUpload.length}`);
  }
  
  if (successCount === filesToUpload.length) {
    console.log('\n🎉 All files uploaded successfully!');
    console.log(`\n🔗 View your repository:`);
    console.log(`   https://github.com/${REPO_OWNER}/${REPO_NAME}\n`);
  } else {
    console.log('\n⚠️  Some files failed to upload. Check errors above.\n');
    process.exit(1);
  }
}

// Run the upload
main().catch(error => {
  console.error('\n💥 Fatal error:', error.message);
  process.exit(1);
});
