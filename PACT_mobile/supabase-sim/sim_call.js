import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// Configuration (copied from project)
const SUPABASE_URL = 'https://abznugnirnlrqnnfkein.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiem51Z25pcm5scnFubmZrZWluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMzU2OTEsImV4cCI6MjA3NDcxMTY5MX0.eAX9yrtgr05OVjAn_Wr2Koi92rMaV32EFj70DFfIgdM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  realtime: { params: { apikey: SUPABASE_ANON } },
});

function buildCallSignal({ type = 'callRequest', from, to, fromName, fromAvatar = null, isAudioOnly = true }) {
  const callId = uuidv4();
  const callToken = uuidv4();
  return {
    type,
    from,
    to,
    fromName,
    fromAvatar,
    callId,
    callToken,
    payload: null,
    timestamp: new Date().toISOString(),
    isAudioOnly,
  };
}

async function simulateCall({ to, from = 'simulator', fromName = 'Simulator Tester' }) {
  const channelName = `calls:user:${to}`;
  const channel = supabase.channel(channelName);

  channel.on('broadcast', { event: 'call-signal' }, (payload) => {
    // no-op
  });

  console.log(`Subscribing to channel ${channelName}...`);
  const { error: subError } = await channel.subscribe();
  if (subError) {
    console.error('Subscribe error:', subError);
    process.exit(1);
  }

  const signal = buildCallSignal({ from, to, fromName });

  try {
    console.log('Sending call-signal payload:', signal);
    // send broadcast
    await channel.send({
      type: 'broadcast',
      event: 'call-signal',
      payload: signal,
    });
    console.log('call-signal sent');
  } catch (e) {
    console.error('Error sending signal:', e);
  } finally {
    // small delay to allow delivery
    setTimeout(async () => {
      await channel.unsubscribe();
      process.exit(0);
    }, 1000);
  }
}

// CLI handling
const args = process.argv.slice(2);
let toArg = null;
let fromArg = 'simulator';
let nameArg = 'Simulator Tester';
for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--to' || args[i] === '-t') && args[i + 1]) {
    toArg = args[i + 1];
  }
  if ((args[i] === '--from' || args[i] === '-f') && args[i + 1]) {
    fromArg = args[i + 1];
  }
  if ((args[i] === '--name' || args[i] === '-n') && args[i + 1]) {
    nameArg = args[i + 1];
  }
}

if (!toArg) {
  console.error('Usage: node sim_call.js --to <targetUserId> [--from <fromId>] [--name "Caller Name"]');
  process.exit(1);
}

simulateCall({ to: toArg, from: fromArg, fromName: nameArg });
