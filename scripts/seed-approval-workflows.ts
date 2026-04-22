/**
 * Seed approval workflows with default configurations
 * Run with: npx tsx scripts/seed-approval-workflows.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface WorkflowSeed {
  name: string;
  description: string;
  taskType: string | null;
  minBudget: number | null;
  maxBudget: number | null;
  stages: Array<{
    stageNumber: number;
    stageName: string;
    approverRole: string | null;
    autoEscalateHours: number;
  }>;
}

const WORKFLOWS: WorkflowSeed[] = [
  {
    name: 'Standard Task Approval',
    description: 'Single-level approval for routine tasks',
    taskType: 'personal_task',
    minBudget: null,
    maxBudget: null,
    stages: [
      {
        stageNumber: 1,
        stageName: 'Manager Review',
        approverRole: 'manager',
        autoEscalateHours: 48,
      },
    ],
  },
  {
    name: 'High-Value Task Approval',
    description: 'Multi-tier approval for high-budget tasks (>$5000)',
    taskType: 'personal_task',
    minBudget: 5000,
    maxBudget: null,
    stages: [
      {
        stageNumber: 1,
        stageName: 'Direct Manager',
        approverRole: 'manager',
        autoEscalateHours: 24,
      },
      {
        stageNumber: 2,
        stageName: 'Department Supervisor',
        approverRole: 'supervisor',
        autoEscalateHours: 24,
      },
      {
        stageNumber: 3,
        stageName: 'Finance Approval',
        approverRole: 'financialadmin',
        autoEscalateHours: 48,
      },
    ],
  },
  {
    name: 'Project Task Approval',
    description: 'Approval workflow for project-based tasks',
    taskType: 'project_field_task',
    minBudget: null,
    maxBudget: null,
    stages: [
      {
        stageNumber: 1,
        stageName: 'Project Manager',
        approverRole: 'manager',
        autoEscalateHours: 36,
      },
      {
        stageNumber: 2,
        stageName: 'Quality Assurance',
        approverRole: 'supervisor',
        autoEscalateHours: 24,
      },
    ],
  },
  {
    name: 'Expense Approval',
    description: 'For tasks involving expenses or cost claims',
    taskType: null,
    minBudget: 500,
    maxBudget: null,
    stages: [
      {
        stageNumber: 1,
        stageName: 'Manager Review',
        approverRole: 'manager',
        autoEscalateHours: 24,
      },
      {
        stageNumber: 2,
        stageName: 'Finance Review',
        approverRole: 'financialadmin',
        autoEscalateHours: 24,
      },
    ],
  },
];

async function seedApprovalWorkflows() {
  try {
    console.log('🌱 Seeding approval workflows...\n');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('❌ Not authenticated. Please login first.');
      process.exit(1);
    }

    console.log(`✓ Authenticated as: ${user.email}\n`);

    for (const workflow of WORKFLOWS) {
      console.log(`Creating workflow: "${workflow.name}"`);

      // Create workflow
      const { data: workflowData, error: workflowError } = await supabase
        .from('approval_workflows')
        .insert({
          name: workflow.name,
          description: workflow.description,
          task_type: workflow.taskType,
          min_budget: workflow.minBudget,
          max_budget: workflow.maxBudget,
          created_by: user.id,
        })
        .select()
        .single();

      if (workflowError) {
        console.error(`  ❌ Failed to create workflow: ${workflowError.message}`);
        continue;
      }

      console.log(`  ✓ Workflow created (ID: ${workflowData.id})`);

      // Create stages
      for (const stage of workflow.stages) {
        const { data: stageData, error: stageError } = await supabase
          .from('approval_workflow_stages')
          .insert({
            workflow_id: workflowData.id,
            stage_number: stage.stageNumber,
            stage_name: stage.stageName,
            approver_role: stage.approverRole,
            auto_escalate_hours: stage.autoEscalateHours,
            notify_on_arrival: true,
          })
          .select()
          .single();

        if (stageError) {
          console.error(`    ❌ Failed to create stage: ${stageError.message}`);
          continue;
        }

        console.log(`    ✓ Stage "${stage.stageName}" created`);
      }

      console.log('');
    }

    console.log('✅ Approval workflows seeding complete!');
  } catch (error) {
    console.error('❌ Error seeding workflows:', error);
    process.exit(1);
  }
}

seedApprovalWorkflows();
