import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://bccvfqvntpiusqoaijfn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjY3ZmcXZudHBpdXNxb2FpamZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYyMDc2MSwiZXhwIjoyMDg4MTk2NzYxfQ.5H6PHX3tc9rLThdePDHnmd9fsg_n-Oc5N2ymoheD9vU');

(async () => {
  try {
    // Check if MMP 2222 exists
    const {data: mmp} = await supabase.from('mmp_files').select('id').eq('name', '2222.csv').single();
    console.log('MMP 2222.csv exists in DB:', !!mmp);
    
    // Check document_index for MMP 2222 entries
    const {data: docs} = await supabase.from('document_index').select('*').ilike('file_name', '%2222%');
    console.log('Entries in document_index for 2222:', docs?.length || 0);
    if (docs?.length) {
      docs.forEach(d => console.log('  -', d.category, d.file_name, 'source:', d.source_id));
    }
    
    // Clean up if MMP doesn't exist
    if (!mmp && docs?.length) {
      const {error, data} = await supabase.from('document_index').delete().ilike('file_name', '%2222%');
      console.log('Cleaned up orphaned entries:', error?.message || 'success - removed ' + data?.length + ' rows');
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
})();
