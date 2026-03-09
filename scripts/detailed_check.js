import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://bccvfqvntpiusqoaijfn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjY3ZmcXZudHBpdXNxb2FpamZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYyMDc2MSwiZXhwIjoyMDg4MTk2NzYxfQ.5H6PHX3tc9rLThdePDHnmd9fsg_n-Oc5N2ymoheD9vU');

(async () => {
  try {
    // Get ALL MMPs without filters
    const {data: mmpFiles, error: mmpError} = await supabase
      .from('mmp_files')
      .select('id, name, project_id, status', { count: 'exact' });
    
    console.log('Total MMPs in mmp_files table:', mmpFiles?.length || 0);
    if (mmpError) console.log('Error:', mmpError);
    
    // Get ALL document_index MMP entries
    const {data: docMmps, error: docError} = await supabase
      .from('document_index')
      .select('*', { count: 'exact' })
      .eq('category', 'mmp_file');
    
    console.log('Total MMP entries in document_index:', docMmps?.length || 0);
    if (docError) console.log('Error:', docError);
    
    // Check for duplicates in document_index by source_id
    if (docMmps && docMmps.length > 0) {
      const sourceIdMap = {};
      docMmps.forEach(doc => {
        if (!sourceIdMap[doc.source_id]) {
          sourceIdMap[doc.source_id] = [];
        }
        sourceIdMap[doc.source_id].push(doc);
      });
      
      console.log('\nChecking for duplicate source_ids in document_index:');
      Object.entries(sourceIdMap).forEach(([sourceId, entries]) => {
        if (entries.length > 1) {
          console.log(`\nSource ID ${sourceId} appears ${entries.length} times:`);
          entries.forEach((e, i) => {
            console.log(`  [${i+1}] Index ID: ${e.id}, File: ${e.file_name}, Project: ${e.project_id || 'none'}`);
          });
        }
      });
      
      if (Object.keys(sourceIdMap).filter(id => sourceIdMap[id].length > 1).length === 0) {
        console.log('No duplicate source_ids found');
      }
    }
    
    // List all MMPs and their corresponding document_index entries
    console.log('\n\nDetailed MMP mapping:');
    if (mmpFiles) {
      for (const mmp of mmpFiles) {
        const indexEntries = docMmps?.filter(d => d.source_id === mmp.id) || [];
        console.log(`\nMMP: ${mmp.name} (ID: ${mmp.id}, Project: ${mmp.project_id || 'none'})`);
        console.log(`  Document Index entries: ${indexEntries.length}`);
        indexEntries.forEach((e, i) => {
          console.log(`    [${i+1}] ${e.id}`);
        });
      }
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
})();
