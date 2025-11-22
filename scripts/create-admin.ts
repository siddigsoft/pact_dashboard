import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createAdminUser() {
  console.log('🔧 Creating admin user...');

  const adminEmail = 'admin@pact.local';
  const adminPassword = 'Siddig@2025';

  try {
    // Step 1: Sign up the admin user
    console.log('Step 1: Creating auth user...');
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: adminEmail,
      password: adminPassword,
      options: {
        data: {
          name: 'Admin',
          username: 'Admin',
          full_name: 'System Administrator',
          role: 'admin',
        }
      }
    });

    if (signUpError) {
      console.error('❌ Signup error:', signUpError);
      
      // Check if user already exists
      if (signUpError.message.includes('already registered')) {
        console.log('⚠️  User already exists, updating profile...');
        
        // Get user ID by email
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', adminEmail)
          .single();
        
        if (existingProfile) {
          // Update existing profile
          await updateProfile(existingProfile.id);
          return;
        }
      }
      throw signUpError;
    }

    console.log('✅ Auth user created:', authData.user?.id);

    // Step 2: Update the profile to set status='approved' and role='admin'
    if (authData.user?.id) {
      await updateProfile(authData.user.id);
    }

    console.log('✅ Admin user created successfully!');
    console.log('📧 Email:', adminEmail);
    console.log('🔑 Password: Siddig@2025');
    console.log('');
    console.log('You can now login with:');
    console.log('  Email: admin@pact.local');
    console.log('  Password: Siddig@2025');

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    throw error;
  }
}

async function updateProfile(userId: string) {
  console.log('Step 2: Updating profile...');
  
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      status: 'approved',
      role: 'admin',
      username: 'Admin',
      full_name: 'System Administrator',
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (updateError) {
    console.error('❌ Profile update error:', updateError);
    throw updateError;
  }

  console.log('✅ Profile updated with admin role and approved status');

  // Step 3: Add admin role to user_roles table
  console.log('Step 3: Adding admin role to user_roles...');
  
  const { error: roleError } = await supabase
    .from('user_roles')
    .upsert({
      user_id: userId,
      role: 'admin',
      created_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,role'
    });

  if (roleError) {
    console.warn('⚠️  Role assignment warning:', roleError);
  } else {
    console.log('✅ Admin role assigned');
  }
}

// Run the function
createAdminUser()
  .then(() => {
    console.log('✅ Admin setup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  });
