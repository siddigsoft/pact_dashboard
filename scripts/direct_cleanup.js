import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://bccvfqvntpiusqoaijfn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjY3ZmcXZudHBpdXNxb2FpamZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYyMDc2MSwiZXhwIjoyMDg4MTk2NzYxfQ.5H6PHX3tc9rLThdePDHnmd9fsg_n-Oc5N2ymoheD9vU');

(async () => {
  try {
    // First, find the exact document_index entry
    const {data: docs, error: selectError} = await supabase
      .from('document_index')
      .select('*')
      .ilike('file_name', '%2222%');
    
    if (selectError) {
      console.log('Error selecting:', selectError.message);
    } else if (docs?.length) {
      const docId = docs[0].id;
      console.log('Found document_index entry with id:', docId);
      
      // Delete it directly
      const {error: deleteError, data: deleteData} = await supabase
        .from('document_index')
        .delete()
        .eq('id', docId);
      
      if (deleteError) {
        console.log('Error deleting:', deleteError.message);
      } else {
        console.log('Successfully removed orphaned entry');
        
        // Verify it's gone
        const {data: verify} = await supabase
          .from('document_index')
          .select('*')
          .ilike('file_name', '%2222%');
        
        console.log('Verification - entries remaining for 2222:', verify?.length || 0);
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
})();
