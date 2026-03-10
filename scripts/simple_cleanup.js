import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://bccvfqvntpiusqoaijfn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjY3ZmcXZudHBpdXNxb2FpamZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYyMDc2MSwiZXhwIjoyMDg4MTk2NzYxfQ.5H6PHX3tc9rLThdePDHnmd9fsg_n-Oc5N2ymoheD9vU');

async function cleanup() {
  console.log('Starting cleanup...');
  
  try {
    // Delete using ilike directly
    const {error, data} = await supabase
      .from('document_index')
      .delete()
      .ilike('file_name', '%2222%');
    
    console.log('Delete completed');
    if (error) {
      console.log('Error:', JSON.stringify(error));
    } else {
      console.log('Success! Cleaned up document entry for 2222.csv');
    }
  } catch (e) {
    console.log('Exception:', e.message);
  }
  
  process.exit(0);
}

cleanup();
