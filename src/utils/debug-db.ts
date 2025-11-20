import { supabase } from '@/integrations/supabase/client';

export const debugDatabase = async () => {
  console.log('🔍 Debugging database connection and schema...');
  
  try {
    // Test 1: Check if we can connect to Supabase
    console.log('1. Testing Supabase connection...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.error('❌ Auth error:', authError);
    } else {
      console.log('✅ Auth successful, user:', user?.id);
    }

    // Test 2: Check if roles table exists
    console.log('2. Checking roles table...');
    const { data: roles, error: rolesError } = await supabase
      .from('roles')
      .select('*')
      .limit(1);
    
    if (rolesError) {
      console.error('❌ Roles table error:', rolesError);
    } else {
      console.log('✅ Roles table accessible, count:', roles?.length || 0);
    }

    // Test 3: Check if permissions table exists
    console.log('3. Checking permissions table...');
    const { data: permissions, error: permissionsError } = await supabase
      .from('permissions')
      .select('*')
      .limit(1);
    
    if (permissionsError) {
      console.error('❌ Permissions table error:', permissionsError);
    } else {
      console.log('✅ Permissions table accessible, count:', permissions?.length || 0);
    }

    // Test 4: Check if get_roles_with_permissions function exists
    console.log('4. Testing get_roles_with_permissions function...');
    const { data: rolesWithPerms, error: functionError } = await supabase
      .rpc('get_roles_with_permissions');
    
    if (functionError) {
      console.error('❌ get_roles_with_permissions function error:', functionError);
    } else {
      console.log('✅ get_roles_with_permissions function works, count:', rolesWithPerms?.length || 0);
    }

    // Test 5: Try to insert a test permission (will be rolled back)
    console.log('5. Testing permission insert...');
    const { data: testRole } = await supabase
      .from('roles')
      .select('id')
      .limit(1)
      .single();
    
    if (testRole) {
      const { error: insertError } = await supabase
        .from('permissions')
        .insert({
          role_id: testRole.id,
          resource: 'test',
          action: 'read'
        });
      
      if (insertError) {
        console.error('❌ Permission insert error:', insertError);
      } else {
        console.log('✅ Permission insert successful');
        // Clean up test data
        await supabase
          .from('permissions')
          .delete()
          .eq('role_id', testRole.id)
          .eq('resource', 'test')
          .eq('action', 'read');
      }
    }

  } catch (error) {
    console.error('❌ Debug error:', error);
  }
};

// Make it available globally for browser console
if (typeof window !== 'undefined') {
  (window as any).debugDatabase = debugDatabase;
}
