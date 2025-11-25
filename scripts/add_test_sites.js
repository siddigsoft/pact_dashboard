import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client - use environment variables that should be available
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.');
  console.error('💡 You can check your .env file or set them in your environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function addTestSites() {
  try {
    console.log('🔄 Adding test sites to database...');

    // First, check if there are any existing dispatched sites
    const { data: existingSites, error: checkError } = await supabase
      .from('mmp_site_entries')
      .select('id, site_name, status, accepted_by')
      .ilike('status', 'Dispatched')
      .is('accepted_by', null)
      .limit(5);

    if (checkError) {
      console.error('❌ Error checking existing sites:', checkError);
      return;
    }

    console.log('📊 Current dispatched sites:', existingSites?.length || 0);

    if ((existingSites?.length || 0) > 0) {
      console.log('⚠️ There are already dispatched sites. Skipping test data creation.');
      console.log('🔍 Existing sites:');
      existingSites?.forEach(site => {
        console.log(`   - ${site.site_name} (ID: ${site.id})`);
      });
      return;
    }

    // Get a test user ID (enumerator)
    const { data: users, error: userError } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .ilike('role', 'datacollector')
      .limit(1);

    if (userError) {
      console.error('❌ Error fetching test user:', userError);
      return;
    }

    if (!users || users.length === 0) {
      console.error('❌ No enumerator users found. Please create an enumerator user first.');
      console.log('💡 You can create a user through the app or database directly.');
      return;
    }

    const testUser = users[0];
    console.log('✅ Found test enumerator user:', testUser.full_name, '(ID:', testUser.id + ')');

    // Create test sites
    const testSites = [
      {
        site_name: 'Test Site 1 - Khartoum Central',
        site_code: 'TS001',
        state: 'Khartoum',
        locality: 'Khartoum Central',
        status: 'Dispatched',
        accepted_by: null,
        mmp_file_id: 'test-mmp-1',
        hub_office: 'Khartoum Hub',
        cp_name: 'Test CP 1',
        activity_at_site: 'Market Monitoring',
        monitoring_by: 'Enumerator',
        survey_tool: 'Mobile App',
        use_market_diversion: true,
        use_warehouse_monitoring: false,
        enumerator_fee: 20,
        transport_fee: 10,
        cost: 30,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        site_name: 'Test Site 2 - Khartoum North',
        site_code: 'TS002',
        state: 'Khartoum',
        locality: 'Khartoum North',
        status: 'Dispatched',
        accepted_by: null,
        mmp_file_id: 'test-mmp-1',
        hub_office: 'Khartoum Hub',
        cp_name: 'Test CP 2',
        activity_at_site: 'Warehouse Monitoring',
        monitoring_by: 'Enumerator',
        survey_tool: 'Mobile App',
        use_market_diversion: false,
        use_warehouse_monitoring: true,
        enumerator_fee: 20,
        transport_fee: 10,
        cost: 30,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        site_name: 'Test Site 3 - Omdurman',
        site_code: 'TS003',
        state: 'Khartoum',
        locality: 'Omdurman',
        status: 'Dispatched',
        accepted_by: null,
        mmp_file_id: 'test-mmp-1',
        hub_office: 'Omdurman Hub',
        cp_name: 'Test CP 3',
        activity_at_site: 'Market Monitoring',
        monitoring_by: 'Enumerator',
        survey_tool: 'Mobile App',
        use_market_diversion: true,
        use_warehouse_monitoring: false,
        enumerator_fee: 20,
        transport_fee: 10,
        cost: 30,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    // Insert test sites
    const { data: insertedSites, error: insertError } = await supabase
      .from('mmp_site_entries')
      .insert(testSites)
      .select();

    if (insertError) {
      console.error('❌ Error inserting test sites:', insertError);
      return;
    }

    console.log('✅ Successfully added test sites:', insertedSites?.length || 0);
    console.log('📋 Test sites added:');
    insertedSites?.forEach(site => {
      console.log(`   - ${site.site_name} (${site.site_code}) - ${site.state}, ${site.locality}`);
    });

    // Verify the sites were added
    const { data: verifySites, error: verifyError } = await supabase
      .from('mmp_site_entries')
      .select('id, site_name, site_code, state, locality, status, accepted_by')
      .ilike('status', 'Dispatched')
      .is('accepted_by', null);

    if (verifyError) {
      console.error('❌ Error verifying sites:', verifyError);
      return;
    }

    console.log('🔍 Verification - Available sites in database:', verifySites?.length || 0);
    console.log('🎉 Test data setup complete! You can now test the accept site functionality.');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the function
addTestSites();