import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://bccvfqvntpiusqoaijfn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjY3ZmcXZudHBpdXNxb2FpamZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYyMDc2MSwiZXhwIjoyMDg4MTk2NzYxfQ.5H6PHX3tc9rLThdePDHnmd9fsg_n-Oc5N2ymoheD9vU');

(async () => {
  try {
    // Get ALL document_index entries with MMP category (paginated)
    let allMmps = [];
    let page = 0;
    let hasMore = true;
    const pageSize = 100;
    
    while (hasMore) {
      const {data, error} = await supabase
        .from('document_index')
        .select('id, file_name, category, project_id, source_id, source_table', { count: 'exact' })
        .eq('category', 'mmp_file')
        .range(page * pageSize, (page + 1) * pageSize - 1);
      
      if (error) {
        console.log('Error on page ' + page + ':', error.message);
        break;
      }
      
      allMmps = allMmps.concat(data || []);
      hasMore = (data?.length || 0) === pageSize;
      page++;
    }
    
    console.log('Total MMP entries across all pages:', allMmps.length);
    
    // Group by file_name
    const byName = {};
    allMmps.forEach(entry => {
      if (!byName[entry.file_name]) {
        byName[entry.file_name] = [];
      }
      byName[entry.file_name].push(entry);
    });
    
    console.log('\nMMP files and their document_index entries:');
    Object.entries(byName).forEach(([name, entries]) => {
      console.log(`\n"${name}" - ${entries.length} index entries:`);
      entries.forEach((e, i) => {
        console.log(`  [${i+1}] index_id: ${e.id}`);
        console.log(`       source_id: ${e.source_id}`);
        console.log(`       source_table: ${e.source_table}`);
        console.log(`       project_id: ${e.project_id || 'NULL'}`);
      });
    });
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
})();
