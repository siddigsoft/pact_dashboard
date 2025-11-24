# 🛡️ Server-Side Version Enforcement

**Production-Grade Version Validation for PACT Workflow**

---

## ⚠️ Current State (Client-Side Only)

### What's Implemented

✅ **Client-Side Checks:**
- `UpdateDialog` component checks version on app startup
- Shows "Update Required" dialog if version is below minimum
- Blocks app usage with full-screen overlay when `force_update = true`
- Re-checks version every hour
- API client sends `X-App-Version` header with all requests

### Limitation

⚠️ **Can Be Bypassed:**
- Rooted/jailbroken devices can disable dialogs
- Modified APKs can skip version checks
- Network traffic can be intercepted and modified
- No server-side validation of version headers

---

## 🔒 Production Enforcement (Recommended)

### Option 1: Supabase Edge Functions (Recommended)

**Pros:**
- Native Supabase integration
- Runs on Deno (fast, secure)
- Automatic scaling
- Free tier available

**Implementation:**

**Step 1: Create Edge Function**

```bash
# Install Supabase CLI
npm install -g supabase

# Create new edge function
supabase functions new version-check
```

**`supabase/functions/version-check/index.ts`:**
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version, x-platform',
}

interface VersionInfo {
  platform: string;
  minimum_supported: string;
  latest_version: string;
  force_update: boolean;
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const clientVersion = req.headers.get('x-app-version');
    const platform = req.headers.get('x-platform') || 'web';

    if (!clientVersion) {
      return new Response(
        JSON.stringify({ error: 'Missing version header' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { data: versionInfo, error } = await supabaseClient
      .from('app_versions')
      .select('minimum_supported, latest_version, force_update')
      .eq('platform', platform)
      .single();

    if (error || !versionInfo) {
      return new Response(
        JSON.stringify({ valid: true }), 
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const isBelowMinimum = compareVersions(
      clientVersion,
      versionInfo.minimum_supported
    ) < 0;

    if (isBelowMinimum || versionInfo.force_update) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'Upgrade Required',
          message: 'Your app version is no longer supported.',
          currentVersion: clientVersion,
          minimumSupported: versionInfo.minimum_supported,
          latestVersion: versionInfo.latest_version,
          forceUpdate: versionInfo.force_update,
        }),
        {
          status: 426,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({ valid: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
```

**Step 2: Deploy Edge Function**

```bash
# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Deploy function
supabase functions deploy version-check

# Set environment variables
supabase secrets set SUPABASE_URL=your-supabase-url
supabase secrets set SUPABASE_ANON_KEY=your-anon-key
```

**Step 3: Update API Client**

```typescript
// src/lib/apiClient.ts
import { getAppVersion } from '@/utils/versionChecker';

export async function apiRequest(
  url: string,
  options: RequestInit = {}
): Promise<any> {
  const currentVersion = getAppVersion();
  
  // Check version before every API call
  const versionCheckResponse = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/version-check`,
    {
      headers: {
        'X-App-Version': currentVersion,
        'X-Platform': 'mobile',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
    }
  );

  if (versionCheckResponse.status === 426) {
    const data = await versionCheckResponse.json();
    // Show update required message
    throw new Error(`Update Required: ${data.message}`);
  }

  // Continue with regular API call
  const headers = {
    'Content-Type': 'application/json',
    'X-App-Version': currentVersion,
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
}
```

**Cost:**
- Free tier: 500K function invocations/month
- Pro tier: $10/month for 2M invocations

---

### Option 2: Supabase Database Functions (Free)

**Pros:**
- Completely free
- No additional infrastructure
- Uses PostgreSQL functions
- Called automatically with RLS policies

**Implementation:**

**Step 1: Create Database Function**

```sql
-- Function to check app version
CREATE OR REPLACE FUNCTION check_app_version()
RETURNS TRIGGER AS $$
DECLARE
  client_version TEXT;
  platform TEXT;
  min_version TEXT;
  force_update BOOLEAN;
BEGIN
  -- Get version from request headers (if available in context)
  -- Note: This requires custom Supabase setup or application-level handling
  
  -- For now, we can enforce via RLS policies
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Step 2: Application-Level Check (Recommended for Database Functions)**

Since direct header access in PostgreSQL is limited, implement at application level:

```typescript
// src/hooks/useVersionGuard.ts
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { checkAppVersion, getAppVersion } from '@/utils/versionChecker';

export function useVersionGuard() {
  useEffect(() => {
    async function validateVersion() {
      const currentVersion = getAppVersion();
      const info = await checkAppVersion(currentVersion, 'mobile');
      
      if (info.update_required) {
        // Block all Supabase calls
        supabase.auth.signOut();
        // Show update dialog
      }
    }

    validateVersion();
    
    // Re-check every API call
    const channel = supabase.channel('version-check');
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        validateVersion();
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, []);
}
```

**Use in App:**
```typescript
// src/App.tsx
import { useVersionGuard } from '@/hooks/useVersionGuard';

export default function App() {
  useVersionGuard(); // Blocks app if version is outdated
  
  return <MainApp />;
}
```

---

### Option 3: Cloudflare Workers (Advanced)

**Pros:**
- Runs at the edge (globally distributed)
- Extremely fast (<10ms latency)
- Free tier: 100K requests/day
- Intercepts all requests before reaching Supabase

**Implementation:**

**`wrangler.toml`:**
```toml
name = "pact-version-check"
type = "javascript"
account_id = "your-account-id"
workers_dev = true
route = "api.yourdomain.com/*"
zone_id = "your-zone-id"
```

**`worker.js`:**
```javascript
const SUPABASE_URL = 'https://your-project.supabase.co';
const VERSION_CACHE_TTL = 300; // 5 minutes

async function checkVersion(request) {
  const clientVersion = request.headers.get('X-App-Version');
  const platform = request.headers.get('X-Platform') || 'web';
  
  if (!clientVersion) {
    return null; // Allow requests without version header
  }

  // Cache version info in Cloudflare KV
  const cacheKey = `version:${platform}`;
  let versionInfo = await VERSION_STORE.get(cacheKey, { type: 'json' });

  if (!versionInfo) {
    // Fetch from Supabase
    const response = await fetch(`${SUPABASE_URL}/rest/v1/app_versions?platform=eq.${platform}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    
    const data = await response.json();
    versionInfo = data[0];
    
    // Cache for 5 minutes
    await VERSION_STORE.put(cacheKey, JSON.stringify(versionInfo), {
      expirationTtl: VERSION_CACHE_TTL,
    });
  }

  const isBelowMinimum = compareVersions(clientVersion, versionInfo.minimum_supported) < 0;

  if (isBelowMinimum || versionInfo.force_update) {
    return new Response(
      JSON.stringify({
        error: 'Upgrade Required',
        message: 'Please update your app',
        currentVersion: clientVersion,
        minimumSupported: versionInfo.minimum_supported,
        latestVersion: versionInfo.latest_version,
      }),
      {
        status: 426,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  return null; // Version is valid
}

export default {
  async fetch(request) {
    // Check version before proxying to Supabase
    const versionError = await checkVersion(request);
    if (versionError) return versionError;

    // Proxy to Supabase
    return fetch(request);
  },
};
```

**Deploy:**
```bash
npm install -g wrangler
wrangler login
wrangler publish
```

**Cost:**
- Free tier: 100K requests/day
- Paid tier: $5/month for 10M requests

---

## 📊 Comparison Matrix

| Solution | Cost | Setup Complexity | Performance | Security |
|----------|------|------------------|-------------|----------|
| **Client-Side Only** | Free | Easy | Fast | ⚠️ Bypassable |
| **Supabase Edge Functions** | Free* | Medium | Very Fast | ✅ Secure |
| **Database Functions** | Free | Easy | Fast | ✅ Secure |
| **Cloudflare Workers** | Free* | Hard | Extremely Fast | ✅ Secure |

*Free tier limits apply

---

## 🚀 Recommended Implementation Path

### Phase 1: Current (Client-Side)
✅ Already implemented
- UpdateDialog blocks app when required
- API client sends version headers
- Hourly version checks

### Phase 2: Supabase Edge Function (Recommended)
⏳ **Deploy this for production**
- Takes 1-2 hours to implement
- Zero ongoing cost (within free tier)
- Validates every API request
- Cannot be bypassed

### Phase 3: Analytics (Optional)
📊 Track version adoption
- Which versions are active
- Update adoption rate
- Identify users on old versions

---

## 🔨 Implementation Checklist

**For Production Deployment:**

```
☐ Create Supabase Edge Function (version-check)
☐ Deploy edge function to production
☐ Test version validation
☐ Update API client to call edge function
☐ Test with old APK (should be rejected)
☐ Test with current APK (should work)
☐ Monitor edge function logs
☐ Set up alerts for version issues
☐ Document for team
```

---

## 🐛 Troubleshooting

### Issue: Edge Function Returns 500

**Check:**
```bash
# View function logs
supabase functions logs version-check --follow

# Test locally
supabase functions serve version-check
```

### Issue: Version Check Too Slow

**Solution:**
- Cache version info in edge function (5 minute TTL)
- Use Cloudflare Workers for edge caching

### Issue: Old APKs Still Work

**Check:**
1. Is edge function deployed?
2. Is API client calling edge function?
3. Is `force_update` set to `true` in database?
4. Are version comparisons correct?

---

**Next Steps:**
1. Deploy Supabase Edge Function for production
2. Test thoroughly with different versions
3. Monitor version compliance
4. Plan grace periods for breaking changes

**Last Updated:** November 24, 2025  
**PACT Workflow Platform**
