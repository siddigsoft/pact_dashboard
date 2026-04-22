/**
 * Seed SLA configurations and escalation rules
 * Run with: npx tsx scripts/seed-sla-config.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface SLASeed {
  name: string;
  taskType: string | null;
  priority: string | null;
  responseTimeHours: number;
  resolutionTimeHours: number;
  description: string;
  escalationRules: Array<{
    escalationLevel: number;
    escalationHours: number;
    escalateToRole: string;
    notifyVia: string[];
    escalationMessage: string;
  }>;
}

const SLA_CONFIGURATIONS: SLASeed[] = [
  {
    name: 'High Priority Personal Task',
    taskType: 'personal_task',
    priority: 'high',
    responseTimeHours: 4,
    resolutionTimeHours: 24,
    description: 'SLA for high-priority personal tasks - fast response required',
    escalationRules: [
      {
        escalationLevel: 1,
        escalationHours: 2,
        escalateToRole: 'manager',
        notifyVia: ['email', 'push'],
        escalationMessage: 'High priority task is approaching SLA breach',
      },
      {
        escalationLevel: 2,
        escalationHours: 4,
        escalateToRole: 'supervisor',
        notifyVia: ['email', 'push', 'whatsapp'],
        escalationMessage: 'High priority task has breached SLA - supervisor escalation',
      },
    ],
  },
  {
    name: 'Standard Personal Task',
    taskType: 'personal_task',
    priority: 'medium',
    responseTimeHours: 24,
    resolutionTimeHours: 72,
    description: 'SLA for standard medium-priority personal tasks',
    escalationRules: [
      {
        escalationLevel: 1,
        escalationHours: 12,
        escalateToRole: 'manager',
        notifyVia: ['email'],
        escalationMessage: 'Standard task approaching SLA response time',
      },
      {
        escalationLevel: 2,
        escalationHours: 24,
        escalateToRole: 'supervisor',
        notifyVia: ['email', 'push'],
        escalationMessage: 'Standard task has breached SLA response time',
      },
    ],
  },
  {
    name: 'Low Priority Personal Task',
    taskType: 'personal_task',
    priority: 'low',
    responseTimeHours: 48,
    resolutionTimeHours: 168,
    description: 'SLA for low-priority personal tasks',
    escalationRules: [
      {
        escalationLevel: 1,
        escalationHours: 24,
        escalateToRole: 'manager',
        notifyVia: ['email'],
        escalationMessage: 'Low priority task approaching SLA',
      },
    ],
  },
  {
    name: 'Project Field Task',
    taskType: 'project_field_task',
    priority: null,
    responseTimeHours: 12,
    resolutionTimeHours: 48,
    description: 'SLA for project-based field tasks',
    escalationRules: [
      {
        escalationLevel: 1,
        escalationHours: 6,
        escalateToRole: 'manager',
        notifyVia: ['email', 'push'],
        escalationMessage: 'Project field task approaching SLA breach',
      },
      {
        escalationLevel: 2,
        escalationHours: 12,
        escalateToRole: 'supervisor',
        notifyVia: ['email', 'push', 'whatsapp'],
        escalationMessage: 'Project field task has breached SLA',
      },
    ],
  },
];

async function seedSLAConfig() {
  try {
    console.log('🌱 Seeding SLA configurations...\n');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('❌ Not authenticated. Please login first.');
      process.exit(1);
    }

    console.log(`✓ Authenticated as: ${user.email}\n`);

    for (const sla of SLA_CONFIGURATIONS) {
      console.log(`Creating SLA: "${sla.name}"`);

      // Create SLA
      const { data: slaData, error: slaError } = await supabase
        .from('task_slas')
        .insert({
          name: sla.name,
          task_type: sla.taskType,
          priority: sla.priority,
          response_time_hours: sla.responseTimeHours,
          resolution_time_hours: sla.resolutionTimeHours,
          description: sla.description,
          created_by: user.id,
        })
        .select()
        .single();

      if (slaError) {
        console.error(`  ❌ Failed to create SLA: ${slaError.message}`);
        continue;
      }

      console.log(`  ✓ SLA created (ID: ${slaData.id})`);

      // Create escalation rules
      for (const rule of sla.escalationRules) {
        const { data: ruleData, error: ruleError } = await supabase
          .from('escalation_rules')
          .insert({
            sla_id: slaData.id,
            escalation_level: rule.escalationLevel,
            escalation_hours: rule.escalationHours,
            escalate_to_role: rule.escalateToRole,
            notify_via: rule.notifyVia,
            escalation_message: rule.escalationMessage,
          })
          .select()
          .single();

        if (ruleError) {
          console.error(`    ❌ Failed to create escalation rule: ${ruleError.message}`);
          continue;
        }

        console.log(`    ✓ Escalation rule level ${rule.escalationLevel} created`);
      }

      console.log('');
    }

    console.log('✅ SLA configuration seeding complete!');
  } catch (error) {
    console.error('❌ Error seeding SLA config:', error);
    process.exit(1);
  }
}

seedSLAConfig();
