/**
 * Script to set up sample task dependencies for testing
 * Run with: npx tsx scripts/seed-task-dependencies.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function seedTaskDependencies() {
  try {
    console.log('🌱 Setting up task dependencies...\n');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('❌ Not authenticated. Please login first.');
      process.exit(1);
    }

    console.log(`✓ Authenticated as: ${user.email}\n`);

    // Get all user's tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('personal_tasks')
      .select('id, title, status')
      .eq('user_id', user.id)
      .limit(10);

    if (tasksError) {
      console.error('❌ Error fetching tasks:', tasksError.message);
      process.exit(1);
    }

    if (!tasks || tasks.length < 2) {
      console.log('⚠️ You need at least 2 tasks to create dependencies. Create some tasks first.');
      process.exit(0);
    }

    console.log(`✓ Found ${tasks.length} tasks\n`);

    // Create sample dependencies (first task blocks second, etc.)
    for (let i = 0; i < tasks.length - 1; i++) {
      const parentTask = tasks[i];
      const dependentTask = tasks[i + 1];

      const { data: depData, error: depError } = await supabase
        .from('task_dependencies')
        .insert({
          parent_task_id: parentTask.id,
          dependent_task_id: dependentTask.id,
          dependency_type: 'blocks',
          lead_time_days: 1,
          description: `${parentTask.title} blocks ${dependentTask.title}`,
          created_by: user.id,
        })
        .select()
        .single();

      if (depError) {
        console.error(
          `❌ Error creating dependency between "${parentTask.title}" and "${dependentTask.title}":`,
          depError.message
        );
        continue;
      }

      console.log(`✓ "${parentTask.title}" → blocks → "${dependentTask.title}"`);

      // Create task schedule entry
      const { error: schedError } = await supabase
        .from('task_schedules')
        .insert({
          task_id: dependentTask.id,
          start_date: new Date().toISOString(),
          planned_end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          can_start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });

      if (schedError && !schedError.message.includes('duplicate')) {
        console.error(`  ⚠️ Error creating schedule: ${schedError.message}`);
      } else {
        console.log(`  ✓ Task schedule created`);
      }
    }

    console.log('\n✅ Task dependencies seeding complete!');
    console.log('💡 Tasks now block their successors - can_start_at enforces the 1-day lead time\n');
  } catch (error) {
    console.error('❌ Error seeding dependencies:', error);
    process.exit(1);
  }
}

seedTaskDependencies();
