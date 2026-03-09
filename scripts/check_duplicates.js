import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://bccvfqvntpiusqoaijfn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjY3ZmcXZudHBpdXNxb2FpamZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYyMDc2MSwiZXhwIjoyMDg4MTk2NzYxfQ.5H6PHX3tc9rLThdePDHnmd9fsg_n-Oc5N2ymoheD9vU');

(async () => {
  try {
    // Check for duplicate MMP files by name
    const {data: mmpFiles} = await supabase
      .from('mmp_files')
      .select('id, name, project_id, created_at, status')
      .order('name');
    
    console.log('Total MMPs in database:', mmpFiles?.length || 0);
    
    // Find duplicates by name
    const nameMap = {};
    mmpFiles?.forEach(mmp => {
      if (!nameMap[mmp.name]) {
        nameMap[mmp.name] = [];
      }
      nameMap[mmp.name].push(mmp);
    });
    
    console.log('\nDuplicate MMP names:');
    Object.entries(nameMap).forEach(([name, entries]) => {
      if (entries.length > 1) {
        console.log(`\n${name} (${entries.length} copies):`);
        entries.forEach((entry, i) => {
          console.log(`  [${i+1}] ID: ${entry.id}, Project: ${entry.project_id || 'none'}, Status: ${entry.status}`);
        });
      }
    });
    
    // Check document_index for duplicates
    const {data: docs} = await supabase
      .from('document_index')
      .select('id, file_name, category, project_id, source_id')
      .eq('category', 'mmp_file')
      .order('file_name');
    
    console.log('\n\nTotal MMP entries in document_index:', docs?.length || 0);
    
    // Find duplicate index entries by file_name
    const indexMap = {};
    docs?.forEach(doc => {
      if (!indexMap[doc.file_name]) {
        indexMap[doc.file_name] = [];
      }
      indexMap[doc.file_name].push(doc);
    });
    
    console.log('\nDuplicate document_index entries:');
    Object.entries(indexMap).forEach(([name, entries]) => {
      if (entries.length > 1) {
        console.log(`\n${name} (${entries.length} copies in index):`);
        entries.forEach((entry, i) => {
          console.log(`  [${i+1}] Index ID: ${entry.id}, Project: ${entry.project_id || 'none'}, Source ID: ${entry.source_id}`);
        });
      }
    });
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
})();
