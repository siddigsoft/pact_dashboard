import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://bccvfqvntpiusqoaijfn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjY3ZmcXZudHBpdXNxb2FpamZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYyMDc2MSwiZXhwIjoyMDg4MTk2NzYxfQ.5H6PHX3tc9rLThdePDHnmd9fsg_n-Oc5N2ymoheD9vU');

(async () => {
  try {
    const {data: mmpFiles} = await supabase
      .from('mmp_files')
      .select('id, name, permits');
    
    console.log('MMP files:', mmpFiles?.length || 0);
    
    mmpFiles?.forEach(mmp => {
      console.log(`\n=== ${mmp.name} (${mmp.id}) ===`);
      const permits = mmp.permits || {};
      
      console.log('\nFederal Permits:', Array.isArray(permits.federalPermits) ? permits.federalPermits.length : 0);
      if (Array.isArray(permits.federalPermits)) {
        permits.federalPermits.forEach((p, i) => {
          console.log(`  [${i}]:`, JSON.stringify(p, null, 2));
        });
      }
      
      console.log('\nState Permits:', Array.isArray(permits.statePermits) ? permits.statePermits.length : 0);
      if (Array.isArray(permits.statePermits)) {
        permits.statePermits.forEach((p, i) => {
          console.log(`  [${i}]:`, JSON.stringify(p, null, 2));
        });
      }
      
      console.log('\nLocal Permits:', Array.isArray(permits.localityPermits) ? permits.localityPermits.length : 0);
      if (Array.isArray(permits.localityPermits)) {
        permits.localityPermits.forEach((p, i) => {
          console.log(`  [${i}]:`, JSON.stringify(p, null, 2));
        });
      }
    });
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
})();
