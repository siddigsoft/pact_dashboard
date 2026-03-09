import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://abznugnirnlrqnnfkein.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiem51Z25pcm5scnFubmZrZWluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTEzNTY5MSwiZXhwIjoyMDc0NzExNjkxfQ.1WIbmd3eCpB15YFYgd8-ujWN8zVujdk7Aqi3RPEiIs8');

(async () => {
  // Check all permits in document_index
  const { data: permits } = await supabase
    .from('document_index')
    .select('id, file_name, file_url, category, mmp_name')
    .in('category', ['federal_permit', 'state_permit', 'local_permit']);

  console.log('=== ALL PERMITS IN DOCUMENT_INDEX ===');
  console.log('Total:', permits?.length);

  // Group by file_url to find duplicates
  const byUrl = {};
  permits?.forEach(p => {
    const key = p.file_url || p.id;
    if (!byUrl[key]) byUrl[key] = [];
    byUrl[key].push(p);
  });

  console.log('\n=== DUPLICATES IN DOCUMENT_INDEX (same file_url) ===');
  let dupCount = 0;
  Object.entries(byUrl).forEach(([url, perms]) => {
    if (perms.length > 1) {
      dupCount++;
      const fileName = url.substring(url.lastIndexOf('/') + 1);
      console.log('\nDUPLICATE:', fileName);
      perms.forEach(p => console.log('  ID:', p.id, 'MMP:', p.mmp_name, 'Cat:', p.category));
    }
  });
  if (dupCount === 0) console.log('No duplicates found in document_index');

  console.log('\n=== ALL MMP FILES PERMITS JSONB ===');
  const { data: mmpFiles } = await supabase.from('mmp_files').select('id, name, permits');
  
  mmpFiles?.forEach(mmp => {
    const p = mmp.permits || {};
    const fed = p.documents?.length || 0;
    const state = p.statePermits?.length || 0;
    const local = p.localityPermits?.length || 0;
    
    if (fed || state || local) {
      console.log('\nMMP:', mmp.name, '(' + mmp.id + ')');
      if (fed) {
        console.log('  Federal:', fed);
        p.documents.forEach((d, i) => console.log('    ' + (i+1) + '.', d.fileName, '-', d.fileUrl?.substring(d.fileUrl.lastIndexOf('/') + 1)));
      }
      if (state) {
        console.log('  State:', state);
        p.statePermits.forEach((s, i) => console.log('    ' + (i+1) + '.', s.fileName, '(' + s.state + ')'));
      }
      if (local) {
        console.log('  Local:', local);
        p.localityPermits.forEach((l, i) => console.log('    ' + (i+1) + '.', l.fileName, '(' + l.locality + ')'));
      }
    }
  });

  process.exit(0);
})();
