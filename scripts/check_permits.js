import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://bccvfqvntpiusqoaijfn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjY3ZmcXZudHBpdXNxb2FpamZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYyMDc2MSwiZXhwIjoyMDg4MTk2NzYxfQ.5H6PHX3tc9rLThdePDHnmd9fsg_n-Oc5N2ymoheD9vU');

(async () => {
  try {
    // Check document_index for all categories
    const {data: allDocs, error: allError} = await supabase
      .from('document_index')
      .select('category', { count: 'exact' });
    
    console.log('Total documents in index:', allDocs?.length || 0);
    
    // Count by category
    const byCategory = {};
    allDocs?.forEach(doc => {
      byCategory[doc.category] = (byCategory[doc.category] || 0) + 1;
    });
    
    console.log('\nDocuments by category:');
    Object.entries(byCategory).sort().forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count}`);
    });
    
    // Check for permits specifically
    const {data: permits} = await supabase
      .from('document_index')
      .select('id, file_name, category, mmp_id, mmp_name')
      .in('category', ['federal_permit', 'state_permit', 'local_permit']);
    
    console.log('\n\nPermits in document_index:');
    if (permits && permits.length > 0) {
      const byType = {};
      permits.forEach(p => {
        if (!byType[p.category]) byType[p.category] = [];
        byType[p.category].push(p);
      });
      
      Object.entries(byType).forEach(([type, perms]) => {
        console.log(`\n${type}: ${perms.length}`);
        perms.slice(0, 3).forEach(p => {
          console.log(`  - ${p.file_name} (MMP: ${p.mmp_name})`);
        });
      });
    } else {
      console.log('NO PERMITS FOUND IN INDEX!');
    }
    
    // Check mmp_files for permits JSONB
    const {data: mmpFiles} = await supabase
      .from('mmp_files')
      .select('id, name, permits');
    
    console.log('\n\nMMPs with permits in JSONB:');
    mmpFiles?.forEach(mmp => {
      const permits = mmp.permits || {};
      const fedCount = Array.isArray(permits.federalPermits) ? permits.federalPermits.length : 0;
      const stateCount = Array.isArray(permits.statePermits) ? permits.statePermits.length : 0;
      const localCount = Array.isArray(permits.localityPermits) ? permits.localityPermits.length : 0;
      
      if (fedCount > 0 || stateCount > 0 || localCount > 0) {
        console.log(`\n${mmp.name}:`);
        if (fedCount > 0) console.log(`  Federal: ${fedCount}`);
        if (stateCount > 0) console.log(`  State: ${stateCount}`);
        if (localCount > 0) console.log(`  Local: ${localCount}`);
      }
    });
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
})();
