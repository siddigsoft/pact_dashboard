/**
 * Push Payment System Guide to GitHub Repository
 * 
 * This script automatically commits PAYMENT_SYSTEM_GUIDE.md to your GitHub repository
 * using the Replit GitHub integration.
 */

import { Octokit } from '@octokit/rest';
import fs from 'fs/promises';
import path from 'path';

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

async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

async function getRepoInfo(octokit) {
  // Get authenticated user
  const { data: user } = await octokit.users.getAuthenticated();
  console.log(`✓ Authenticated as: ${user.login}`);
  
  // List repositories to find the right one
  const { data: repos } = await octokit.repos.listForAuthenticatedUser({
    sort: 'updated',
    per_page: 100
  });
  
  console.log(`\nFound ${repos.length} repositories. Looking for PACT repository...\n`);
  
  // Try to find PACT-related repository
  const pactRepo = repos.find(repo => 
    repo.name.toLowerCase().includes('pact') || 
    repo.description?.toLowerCase().includes('pact') ||
    repo.name.toLowerCase().includes('workflow') ||
    repo.name.toLowerCase().includes('mmp')
  );
  
  if (pactRepo) {
    console.log(`✓ Found repository: ${pactRepo.full_name}`);
    console.log(`  Description: ${pactRepo.description || 'No description'}`);
    console.log(`  Default branch: ${pactRepo.default_branch}\n`);
    return {
      owner: pactRepo.owner.login,
      repo: pactRepo.name,
      branch: pactRepo.default_branch
    };
  }
  
  // If no PACT repo found, use the first repo or prompt
  console.log('⚠ No PACT-specific repository found. Using most recently updated repository:');
  console.log(`  ${repos[0].full_name}\n`);
  
  return {
    owner: repos[0].owner.login,
    repo: repos[0].name,
    branch: repos[0].default_branch
  };
}

async function pushPaymentGuide() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📤 PACT Payment Guide - GitHub Push Script');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    // Step 1: Initialize GitHub client
    console.log('🔐 Authenticating with GitHub...');
    const octokit = await getUncachableGitHubClient();
    
    // Step 2: Get repository information
    console.log('📁 Finding repository...');
    const repoInfo = await getRepoInfo(octokit);
    
    // Step 3: Read the payment guide file
    console.log('📖 Reading PAYMENT_SYSTEM_GUIDE.md...');
    const filePath = path.join(process.cwd(), 'PAYMENT_SYSTEM_GUIDE.md');
    const fileContent = await fs.readFile(filePath, 'utf8');
    console.log(`✓ Read ${fileContent.length} characters\n`);
    
    // Step 4: Get current file SHA if it exists (for updates)
    console.log('🔍 Checking if file already exists in repository...');
    let currentSha = null;
    try {
      const { data: existingFile } = await octokit.repos.getContent({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        path: 'PAYMENT_SYSTEM_GUIDE.md',
        ref: repoInfo.branch
      });
      currentSha = existingFile.sha;
      console.log('✓ File exists - will update\n');
    } catch (error) {
      if (error.status === 404) {
        console.log('✓ File does not exist - will create new\n');
      } else {
        throw error;
      }
    }
    
    // Step 5: Create or update the file
    console.log('📝 Committing to GitHub...');
    const commitMessage = currentSha 
      ? 'docs: Update comprehensive payment system guide'
      : 'docs: Add comprehensive payment system guide';
    
    const { data: result } = await octokit.repos.createOrUpdateFileContents({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      path: 'PAYMENT_SYSTEM_GUIDE.md',
      message: commitMessage,
      content: Buffer.from(fileContent).toString('base64'),
      sha: currentSha || undefined,
      branch: repoInfo.branch
    });
    
    console.log('✓ Successfully committed!\n');
    
    // Step 6: Display success information
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ SUCCESS!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📊 Commit Details:');
    console.log(`   Repository: ${repoInfo.owner}/${repoInfo.repo}`);
    console.log(`   Branch: ${repoInfo.branch}`);
    console.log(`   Commit: ${result.commit.sha.substring(0, 7)}`);
    console.log(`   Message: "${commitMessage}"`);
    console.log(`\n🔗 View on GitHub:`);
    console.log(`   ${result.content.html_url}`);
    console.log(`\n🎉 Payment System Guide successfully pushed to GitHub!\n`);
    
  } catch (error) {
    console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ ERROR');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (error.message.includes('GitHub not connected')) {
      console.error('⚠ GitHub integration not configured.');
      console.error('   Please connect GitHub in your Replit project settings.\n');
    } else if (error.status === 404) {
      console.error('⚠ Repository not found or no access.');
      console.error('   Please verify repository permissions.\n');
    } else if (error.status === 403) {
      console.error('⚠ Permission denied.');
      console.error('   Please ensure you have write access to the repository.\n');
    } else {
      console.error('⚠ Unexpected error:');
      console.error(`   ${error.message}\n`);
      if (error.response) {
        console.error('   GitHub API Response:', error.response.data);
      }
    }
    
    process.exit(1);
  }
}

// Run the script
pushPaymentGuide();
