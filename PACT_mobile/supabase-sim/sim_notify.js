import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

const SUPABASE_URL = 'https://abznugnirnlrqnnfkein.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiem51Z25pcm5scnFubmZrZWluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMzU2OTEsImV4cCI6MjA3NDcxMTY5MX0.eAX9yrtgr05OVjAn_Wr2Koi92rMaV32EFj70DFfIgdM';

async function insertNotification({ userId, callerName = 'Simulator', callId = null, type = 'incoming_call' }) {
  const url = `${SUPABASE_URL}/rest/v1/notifications`;

  const payload = {
    user_id: userId,
    title: type === 'incoming_call' ? 'Incoming Call' : 'Missed Call',
    body: type === 'incoming_call' ? `${callerName} is calling you` : `You missed a call from ${callerName}`,
    type: type,
    link: callId ? `call:${callId}` : 'call:simulated',
    is_read: false,
    created_at: new Date().toISOString(),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', text);
}

// CLI
const args = process.argv.slice(2);
let userId = null;
for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--user' || args[i] === '-u') && args[i + 1]) {
    userId = args[i + 1];
  }
}

if (!userId) {
  console.error('Usage: node sim_notify.js --user <targetUserId>');
  process.exit(1);
}

insertNotification({ userId }).catch((e) => {
  console.error('Insert error:', e);
  process.exit(1);
});
