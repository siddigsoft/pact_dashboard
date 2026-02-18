const { RealtimeClient } = require('@supabase/realtime-js');
const fetch = require('node-fetch');

// Configure these from the project's Supabase config
const SUPABASE_URL = 'https://abznugnirnlrqnnfkein.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiem51Z25pcm5scnFubmZrZWluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMzU2OTEsImV4cCI6MjA3NDcxMTY5MX0.eAX9yrtgr05OVjAn_Wr2Koi92rMaV32EFj70DFfIgdM';

// Target user id (the emulator client)
const TARGET_USER_ID = 'eeaf10a4-84ad-42d7-8042-ab0a42e69e5b';

async function publishCallSignal() {
  const realtimeUrl = SUPABASE_URL.replace('https://', 'wss://') + '/realtime/v1';
  const client = new RealtimeClient(realtimeUrl, {
    params: { apikey: SUPABASE_ANON_KEY },
    WebSocket: require('ws'),
  });

  await client.connect();
  console.log('Realtime connected');

  const channel = client.channel(`calls:user:${TARGET_USER_ID}`);
  channel.subscribe((status, err) => {
    console.log('channel status:', status, err || '');
  });

  // Wait until subscribed
  await new Promise((res, rej) => {
    const t = setInterval(() => {
      if (channel?.state?.status === 'joined') {
        clearInterval(t);
        res();
      }
    }, 100);
    setTimeout(() => rej(new Error('Channel subscribe timeout')), 5000);
  });

  const callSignal = {
    type: 'callRequest',
    from: 'simulator-000',
    to: TARGET_USER_ID,
    fromName: 'Simulator',
    fromAvatar: null,
    callId: 'sim-' + Date.now(),
    callToken: 'token-' + Date.now(),
    payload: null,
    timestamp: new Date().toISOString(),
    isAudioOnly: true,
  };

  channel.send({ type: 'broadcast', event: 'call-signal', payload: callSignal });
  console.log('Published call-signal to', `calls:user:${TARGET_USER_ID}`);

  // allow some time then disconnect
  setTimeout(() => {
    client.disconnect();
    process.exit(0);
  }, 1000);
}

async function insertNotification() {
  // Insert a notification row via PostgREST
  const url = SUPABASE_URL + '/rest/v1/notifications';
  const body = {
    user_id: TARGET_USER_ID,
    title: 'Incoming Call',
    body: 'Simulator is calling you',
    type: 'incoming_call',
    link: 'call:sim',
    is_read: false,
    created_at: new Date().toISOString(),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    console.log('Inserted notification for', TARGET_USER_ID);
  } else {
    console.error('Failed to insert notification', res.status, await res.text());
  }
}

(async () => {
  try {
    console.log('Step A: publishing realtime call signal...');
    try {
      await publishCallSignal();
    } catch (e) {
      console.error('Realtime publish failed, continuing to Step B:', e.message || e);
    }

    console.log('Step B: inserting notification via REST...');
    await insertNotification();
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();
