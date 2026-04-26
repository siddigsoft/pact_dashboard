import type { ProjectType } from '@/types/project';

export interface ProjectDeliverable {
  id: string;
  label: string;
  phase?: string;
}

export interface BudgetCategory {
  key: string;
  label: string;
  placeholder?: string;
}

export interface TeamRoleSuggestion {
  role: string;
  count: number;
}

export interface ProjectTypeConfig {
  label: string;
  shortLabel: string;
  description: string;
  deliverables: ProjectDeliverable[];
  budgetCategories: BudgetCategory[];
  typicalTeamRoles: TeamRoleSuggestion[];
  tabLabels: {
    monitoring?: string;
    planning?: string;
    reporting?: string;
  };
  templateDefaults: {
    durationDays: number;
    description: string;
  };
}

export const PROJECT_TYPE_CONFIGS: Record<string, ProjectTypeConfig> = {
  tpm: {
    label: 'Third Party Monitoring (TPM)',
    shortLabel: 'TPM',
    description: 'Independent field monitoring of project implementation for donor/client accountability.',
    deliverables: [
      { id: 'tpm-1', label: 'Inception Report', phase: 'Inception' },
      { id: 'tpm-2', label: 'Stakeholder Mapping', phase: 'Inception' },
      { id: 'tpm-3', label: 'Site Registry & Coverage Plan', phase: 'Site Selection' },
      { id: 'tpm-4', label: 'Approved Monthly Monitoring Plan (MMP)', phase: 'MMP Design' },
      { id: 'tpm-5', label: 'Enumerator Training Attendance Register', phase: 'Enumerator Training' },
      { id: 'tpm-6', label: 'Verified Site Visit Records', phase: 'Field Verification' },
      { id: 'tpm-7', label: 'Photo Documentation Package', phase: 'Field Verification' },
      { id: 'tpm-8', label: 'Cleaned Dataset & Data Quality Log', phase: 'Data Processing' },
      { id: 'tpm-9', label: 'Draft TPM Report', phase: 'Reporting' },
      { id: 'tpm-10', label: 'Final TPM Report', phase: 'Reporting' },
      { id: 'tpm-11', label: 'Executive Summary', phase: 'Reporting' },
      { id: 'tpm-12', label: 'Recommendation Tracker', phase: 'Recommendations Tracking' },
    ],
    budgetCategories: [
      { key: 'transportation_and_visit_fees', label: 'Transportation & Site Visit Fees', placeholder: '0.00' },
      { key: 'enumerator_fees', label: 'Enumerator / Field Staff Fees', placeholder: '0.00' },
      { key: 'supervisor_fees', label: 'Supervisor Fees', placeholder: '0.00' },
      { key: 'permit_fee', label: 'Permit & Access Fees', placeholder: '0.00' },
      { key: 'data_collection_tools', label: 'Data Collection Tools & Technology', placeholder: '0.00' },
      { key: 'internet_and_communication_fees', label: 'Internet & Communication', placeholder: '0.00' },
      { key: 'report_production', label: 'Report Production & Printing', placeholder: '0.00' },
      { key: 'management_overhead', label: 'Management & Overhead', placeholder: '0.00' },
    ],
    typicalTeamRoles: [
      { role: 'projectManager', count: 1 },
      { role: 'supervisor', count: 2 },
      { role: 'dataCollector', count: 5 },
      { role: 'analyst', count: 1 },
    ],
    tabLabels: {
      monitoring: 'Flow',
      reporting: 'TPM Reports',
    },
    templateDefaults: {
      durationDays: 90,
      description: 'Third Party Monitoring engagement to independently verify programme implementation, beneficiary data, and compliance with donor requirements.',
    },
  },

  baseline_survey: {
    label: 'Baseline Survey',
    shortLabel: 'Baseline',
    description: 'Establish baseline values for programme indicators before implementation begins.',
    deliverables: [
      { id: 'bl-1', label: 'Inception Report', phase: 'Inception' },
      { id: 'bl-2', label: 'Survey Terms of Reference', phase: 'Inception' },
      { id: 'bl-3', label: 'Sampling Frame & Strategy', phase: 'Inception' },
      { id: 'bl-4', label: 'Methodology Note', phase: 'Methodology Design' },
      { id: 'bl-5', label: 'Indicator Framework', phase: 'Methodology Design' },
      { id: 'bl-6', label: 'Approved Survey Questionnaire', phase: 'Tool Development' },
      { id: 'bl-7', label: 'Digital Data Collection Form (ODK/KoBoToolbox)', phase: 'Tool Development' },
      { id: 'bl-8', label: 'Translation Sign-off', phase: 'Tool Development' },
      { id: 'bl-9', label: 'Training Attendance Register', phase: 'Enumerator Training' },
      { id: 'bl-10', label: 'Pilot Report', phase: 'Pilot' },
      { id: 'bl-11', label: 'Completed Survey Submissions', phase: 'Data Collection' },
      { id: 'bl-12', label: 'Clean Dataset', phase: 'Data Cleaning' },
      { id: 'bl-13', label: 'Data Cleaning Log', phase: 'Data Cleaning' },
      { id: 'bl-14', label: 'Statistical Analysis Tables', phase: 'Analysis' },
      { id: 'bl-15', label: 'Draft Baseline Report', phase: 'Report Writing' },
      { id: 'bl-16', label: 'Final Baseline Report', phase: 'Report Writing' },
      { id: 'bl-17', label: 'Dissemination Record', phase: 'Dissemination' },
    ],
    budgetCategories: [
      { key: 'transportation_and_visit_fees', label: 'Transportation & Field Logistics', placeholder: '0.00' },
      { key: 'enumerator_fees', label: 'Enumerator Fees (Daily Rate × Days)', placeholder: '0.00' },
      { key: 'supervisor_fees', label: 'Field Supervisor Fees', placeholder: '0.00' },
      { key: 'data_management', label: 'Data Management & Analysis', placeholder: '0.00' },
      { key: 'permit_fee', label: 'Permits & Regulatory Fees', placeholder: '0.00' },
      { key: 'internet_and_communication_fees', label: 'Internet & Communication', placeholder: '0.00' },
      { key: 'printing_and_materials', label: 'Printing & Survey Materials', placeholder: '0.00' },
      { key: 'report_production', label: 'Report Writing & Design', placeholder: '0.00' },
      { key: 'management_overhead', label: 'Management & Overhead', placeholder: '0.00' },
    ],
    typicalTeamRoles: [
      { role: 'projectManager', count: 1 },
      { role: 'analyst', count: 2 },
      { role: 'supervisor', count: 3 },
      { role: 'dataCollector', count: 10 },
    ],
    tabLabels: {
      planning: 'Survey Design',
      reporting: 'Survey Reports',
    },
    templateDefaults: {
      durationDays: 120,
      description: 'Baseline survey to establish pre-intervention indicator values and benchmark data for future comparison.',
    },
  },

  endline_survey: {
    label: 'Endline Survey',
    shortLabel: 'Endline',
    description: 'Measure final programme outcomes and compare with baseline data to assess impact.',
    deliverables: [
      { id: 'el-1', label: 'Endline Inception Report', phase: 'Inception' },
      { id: 'el-2', label: 'Comparison Framework', phase: 'Inception' },
      { id: 'el-3', label: 'Revised Sampling Frame', phase: 'Inception' },
      { id: 'el-4', label: 'Endline Methodology Note', phase: 'Methodology Design' },
      { id: 'el-5', label: 'Indicator Tracking Matrix', phase: 'Methodology Design' },
      { id: 'el-6', label: 'Updated Survey Questionnaire', phase: 'Tool Development' },
      { id: 'el-7', label: 'Training Attendance Register', phase: 'Enumerator Training' },
      { id: 'el-8', label: 'Pilot Report', phase: 'Pilot' },
      { id: 'el-9', label: 'Completed Survey Submissions', phase: 'Data Collection' },
      { id: 'el-10', label: 'Clean Endline Dataset', phase: 'Data Cleaning' },
      { id: 'el-11', label: 'Baseline-Endline Comparison Dataset', phase: 'Data Cleaning' },
      { id: 'el-12', label: 'Impact Analysis Tables', phase: 'Analysis' },
      { id: 'el-13', label: 'Statistical Significance Tests', phase: 'Analysis' },
      { id: 'el-14', label: 'Draft Endline Report', phase: 'Report Writing' },
      { id: 'el-15', label: 'Final Endline Report', phase: 'Report Writing' },
      { id: 'el-16', label: 'Baseline-Endline Comparison Table', phase: 'Report Writing' },
    ],
    budgetCategories: [
      { key: 'transportation_and_visit_fees', label: 'Transportation & Field Logistics', placeholder: '0.00' },
      { key: 'enumerator_fees', label: 'Enumerator Fees', placeholder: '0.00' },
      { key: 'supervisor_fees', label: 'Field Supervisor Fees', placeholder: '0.00' },
      { key: 'data_management', label: 'Data Management & Comparative Analysis', placeholder: '0.00' },
      { key: 'permit_fee', label: 'Permits & Regulatory Fees', placeholder: '0.00' },
      { key: 'internet_and_communication_fees', label: 'Internet & Communication', placeholder: '0.00' },
      { key: 'report_production', label: 'Report Writing & Design', placeholder: '0.00' },
      { key: 'management_overhead', label: 'Management & Overhead', placeholder: '0.00' },
    ],
    typicalTeamRoles: [
      { role: 'projectManager', count: 1 },
      { role: 'analyst', count: 2 },
      { role: 'supervisor', count: 3 },
      { role: 'dataCollector', count: 10 },
    ],
    tabLabels: {
      planning: 'Survey Design',
      reporting: 'Endline Reports',
    },
    templateDefaults: {
      durationDays: 120,
      description: 'Endline survey to measure final programme outcomes and compare with baseline data to assess impact.',
    },
  },

  assessment: {
    label: 'Field Assessment',
    shortLabel: 'Assessment',
    description: 'Rapid or in-depth assessment to understand a situation, need, or context.',
    deliverables: [
      { id: 'as-1', label: 'Inception Report & Assessment Framework', phase: 'Inception' },
      { id: 'as-2', label: 'Work Plan', phase: 'Inception' },
      { id: 'as-3', label: 'Methodology Note', phase: 'Methodology Design' },
      { id: 'as-4', label: 'Assessment Matrix', phase: 'Methodology Design' },
      { id: 'as-5', label: 'Data Collection Tools', phase: 'Tool Development' },
      { id: 'as-6', label: 'Interview Guides (KII & FGD)', phase: 'Tool Development' },
      { id: 'as-7', label: 'Training Attendance Register', phase: 'Enumerator Training' },
      { id: 'as-8', label: 'Completed Data Forms', phase: 'Data Collection' },
      { id: 'as-9', label: 'Interview Transcripts', phase: 'Data Collection' },
      { id: 'as-10', label: 'FGD Notes', phase: 'Data Collection' },
      { id: 'as-11', label: 'Clean Dataset & Validation Log', phase: 'Data Cleaning' },
      { id: 'as-12', label: 'Key Findings Summary', phase: 'Analysis' },
      { id: 'as-13', label: 'Draft Assessment Report', phase: 'Report Writing' },
      { id: 'as-14', label: 'Stakeholder Validation Notes', phase: 'Report Writing' },
      { id: 'as-15', label: 'Final Assessment Report', phase: 'Report Writing' },
    ],
    budgetCategories: [
      { key: 'transportation_and_visit_fees', label: 'Transportation & Field Logistics', placeholder: '0.00' },
      { key: 'enumerator_fees', label: 'Field Team / Enumerator Fees', placeholder: '0.00' },
      { key: 'key_informant_incentives', label: 'Key Informant / FGD Incentives', placeholder: '0.00' },
      { key: 'data_management', label: 'Data Management & Analysis', placeholder: '0.00' },
      { key: 'permit_fee', label: 'Permits & Access Fees', placeholder: '0.00' },
      { key: 'internet_and_communication_fees', label: 'Internet & Communication', placeholder: '0.00' },
      { key: 'report_production', label: 'Report Writing & Design', placeholder: '0.00' },
      { key: 'management_overhead', label: 'Management & Overhead', placeholder: '0.00' },
    ],
    typicalTeamRoles: [
      { role: 'projectManager', count: 1 },
      { role: 'analyst', count: 1 },
      { role: 'coordinator', count: 1 },
      { role: 'dataCollector', count: 4 },
    ],
    tabLabels: {
      planning: 'Assessment Framework',
      reporting: 'Assessment Reports',
    },
    templateDefaults: {
      durationDays: 60,
      description: 'Field assessment to understand the current situation, needs, or context in a defined geographic or programmatic area.',
    },
  },

  evaluation: {
    label: 'Programme Evaluation',
    shortLabel: 'Evaluation',
    description: 'Systematic evaluation of programme relevance, effectiveness, efficiency, impact, and sustainability.',
    deliverables: [
      { id: 'ev-1', label: 'Inception Report', phase: 'Inception' },
      { id: 'ev-2', label: 'Evaluation Matrix', phase: 'Inception' },
      { id: 'ev-3', label: 'Theory of Change Review', phase: 'Inception' },
      { id: 'ev-4', label: 'Work Plan', phase: 'Inception' },
      { id: 'ev-5', label: 'Evaluation Methodology Note', phase: 'Methodology Design' },
      { id: 'ev-6', label: 'Data Source Map', phase: 'Methodology Design' },
      { id: 'ev-7', label: 'Evaluation Questionnaire', phase: 'Tool Development' },
      { id: 'ev-8', label: 'KII & FGD Guides', phase: 'Tool Development' },
      { id: 'ev-9', label: 'Survey Data & Interview Transcripts', phase: 'Data Collection' },
      { id: 'ev-10', label: 'Secondary Data Analysis', phase: 'Data Collection' },
      { id: 'ev-11', label: 'OECD-DAC Criteria Scoring', phase: 'Data Analysis' },
      { id: 'ev-12', label: 'Findings Matrix', phase: 'Data Analysis' },
      { id: 'ev-13', label: 'Draft Evaluation Report', phase: 'Draft Report' },
      { id: 'ev-14', label: 'Executive Summary', phase: 'Draft Report' },
      { id: 'ev-15', label: 'Validation Workshop Report', phase: 'Stakeholder Validation' },
      { id: 'ev-16', label: 'Management Response (Draft)', phase: 'Stakeholder Validation' },
      { id: 'ev-17', label: 'Final Evaluation Report', phase: 'Final Report' },
      { id: 'ev-18', label: 'Final Management Response', phase: 'Final Report' },
      { id: 'ev-19', label: 'Learning Session Report', phase: 'Learning Session' },
      { id: 'ev-20', label: 'Action Plan for Recommendations', phase: 'Learning Session' },
    ],
    budgetCategories: [
      { key: 'transportation_and_visit_fees', label: 'Transportation & Field Logistics', placeholder: '0.00' },
      { key: 'evaluation_team_fees', label: 'Evaluation Team Professional Fees', placeholder: '0.00' },
      { key: 'enumerator_fees', label: 'Enumerator / Research Assistant Fees', placeholder: '0.00' },
      { key: 'data_management', label: 'Data Management & Analysis', placeholder: '0.00' },
      { key: 'workshop_facilitation', label: 'Validation Workshop & Facilitation', placeholder: '0.00' },
      { key: 'internet_and_communication_fees', label: 'Internet & Communication', placeholder: '0.00' },
      { key: 'report_production', label: 'Report Production & Dissemination', placeholder: '0.00' },
      { key: 'management_overhead', label: 'Management & Overhead', placeholder: '0.00' },
    ],
    typicalTeamRoles: [
      { role: 'projectManager', count: 1 },
      { role: 'analyst', count: 2 },
      { role: 'reviewer', count: 1 },
      { role: 'dataCollector', count: 4 },
    ],
    tabLabels: {
      planning: 'Evaluation Framework',
      reporting: 'Evaluation Reports',
    },
    templateDefaults: {
      durationDays: 150,
      description: 'Programme evaluation assessing relevance, effectiveness, efficiency, impact, and sustainability against OECD-DAC criteria.',
    },
  },

  research: {
    label: 'Research Study',
    shortLabel: 'Research',
    description: 'Primary or secondary research to generate new knowledge and evidence.',
    deliverables: [
      { id: 'rs-1', label: 'Approved Concept Note', phase: 'Concept Note' },
      { id: 'rs-2', label: 'Research Proposal', phase: 'Concept Note' },
      { id: 'rs-3', label: 'Budget Plan', phase: 'Concept Note' },
      { id: 'rs-4', label: 'Ethics Certificate', phase: 'Ethics & Approvals' },
      { id: 'rs-5', label: 'Research Permit', phase: 'Ethics & Approvals' },
      { id: 'rs-6', label: 'Government Clearance Letter', phase: 'Ethics & Approvals' },
      { id: 'rs-7', label: 'Research Instruments (Finalized)', phase: 'Instrument Development' },
      { id: 'rs-8', label: 'Pre-test Report', phase: 'Instrument Development' },
      { id: 'rs-9', label: 'Coding Framework', phase: 'Instrument Development' },
      { id: 'rs-10', label: 'Primary Dataset', phase: 'Data Collection' },
      { id: 'rs-11', label: 'Interview Transcripts / Field Notes', phase: 'Data Collection' },
      { id: 'rs-12', label: 'Analysis Outputs', phase: 'Data Analysis' },
      { id: 'rs-13', label: 'Thematic Codes & Themes', phase: 'Data Analysis' },
      { id: 'rs-14', label: 'Draft Research Paper/Report', phase: 'Draft Write-up' },
      { id: 'rs-15', label: 'Peer Review Comments & Revision Log', phase: 'Peer Review' },
      { id: 'rs-16', label: 'Published Research Report/Paper', phase: 'Publication' },
      { id: 'rs-17', label: 'Dissemination Plan & Materials', phase: 'Publication' },
    ],
    budgetCategories: [
      { key: 'research_protocol_costs', label: 'Research Protocol & Ethics Fees', placeholder: '0.00' },
      { key: 'transportation_and_visit_fees', label: 'Transportation & Field Data Collection', placeholder: '0.00' },
      { key: 'enumerator_fees', label: 'Research Assistants / Enumerator Fees', placeholder: '0.00' },
      { key: 'data_management', label: 'Data Management & Analysis Software', placeholder: '0.00' },
      { key: 'permit_fee', label: 'Research Permits & Government Fees', placeholder: '0.00' },
      { key: 'internet_and_communication_fees', label: 'Internet & Communication', placeholder: '0.00' },
      { key: 'publication_costs', label: 'Publication & Dissemination Costs', placeholder: '0.00' },
      { key: 'management_overhead', label: 'Management & Overhead', placeholder: '0.00' },
    ],
    typicalTeamRoles: [
      { role: 'projectManager', count: 1 },
      { role: 'analyst', count: 2 },
      { role: 'reviewer', count: 1 },
      { role: 'dataCollector', count: 3 },
    ],
    tabLabels: {
      planning: 'Research Protocol',
      reporting: 'Research Outputs',
    },
    templateDefaults: {
      durationDays: 180,
      description: 'Research study to generate new evidence and knowledge relevant to humanitarian, development, or policy questions.',
    },
  },

  capacity_building: {
    label: 'Capacity Building',
    shortLabel: 'Capacity',
    description: 'Training, mentoring, or organisational development to strengthen skills and knowledge.',
    deliverables: [
      { id: 'cb-1', label: 'Training Needs Assessment (TNA) Report', phase: 'Needs Assessment' },
      { id: 'cb-2', label: 'Capacity Gap Analysis', phase: 'Needs Assessment' },
      { id: 'cb-3', label: 'Training Plan & Session Schedule', phase: 'Curriculum Design' },
      { id: 'cb-4', label: 'Learning Objectives Matrix', phase: 'Curriculum Design' },
      { id: 'cb-5', label: "Facilitator's Guide", phase: 'Material Development' },
      { id: 'cb-6', label: "Participant's Workbook", phase: 'Material Development' },
      { id: 'cb-7', label: 'Presentation Slides & Handouts', phase: 'Material Development' },
      { id: 'cb-8', label: 'Attendance Register', phase: 'Training Delivery' },
      { id: 'cb-9', label: 'Pre/Post Test Results', phase: 'Training Delivery' },
      { id: 'cb-10', label: 'Daily Session Evaluations', phase: 'Training Delivery' },
      { id: 'cb-11', label: 'Competency Verification Report', phase: 'Post-Training Assessment' },
      { id: 'cb-12', label: 'Certification Records', phase: 'Post-Training Assessment' },
      { id: 'cb-13', label: 'Follow-up Visit Records', phase: 'Follow-up & Mentoring' },
      { id: 'cb-14', label: 'Capacity Improvement Report', phase: 'Follow-up & Mentoring' },
    ],
    budgetCategories: [
      { key: 'venue_costs', label: 'Venue & Conference Facilities', placeholder: '0.00' },
      { key: 'training_materials', label: 'Training Materials & Printing', placeholder: '0.00' },
      { key: 'per_diem', label: 'Participant Per Diem & Accommodation', placeholder: '0.00' },
      { key: 'transportation_and_visit_fees', label: 'Transportation (Participants & Facilitators)', placeholder: '0.00' },
      { key: 'facilitator_fees', label: 'Facilitator / Expert Fees', placeholder: '0.00' },
      { key: 'catering', label: 'Catering & Refreshments', placeholder: '0.00' },
      { key: 'internet_and_communication_fees', label: 'Internet & Communication', placeholder: '0.00' },
      { key: 'management_overhead', label: 'Management & Overhead', placeholder: '0.00' },
    ],
    typicalTeamRoles: [
      { role: 'projectManager', count: 1 },
      { role: 'coordinator', count: 1 },
      { role: 'reviewer', count: 1 },
    ],
    tabLabels: {
      planning: 'Training Materials',
      reporting: 'Training Reports',
    },
    templateDefaults: {
      durationDays: 45,
      description: 'Capacity building programme to strengthen the skills and knowledge of staff or community members through targeted training and mentoring.',
    },
  },

  compliance: {
    label: 'Compliance Review',
    shortLabel: 'Compliance',
    description: 'Review of adherence to policies, regulations, donor requirements, or standards.',
    deliverables: [
      { id: 'co-1', label: 'Review Plan & Compliance Checklist', phase: 'Kickoff' },
      { id: 'co-2', label: 'Document Request List', phase: 'Kickoff' },
      { id: 'co-3', label: 'Document Review Matrix', phase: 'Document Review' },
      { id: 'co-4', label: 'Initial Findings Log', phase: 'Document Review' },
      { id: 'co-5', label: 'Field Visit Reports', phase: 'Field Verification' },
      { id: 'co-6', label: 'Interview Notes & Photo Evidence', phase: 'Field Verification' },
      { id: 'co-7', label: 'Draft Findings Report', phase: 'Findings Report' },
      { id: 'co-8', label: 'Risk Rating Matrix', phase: 'Findings Report' },
      { id: 'co-9', label: 'Non-Compliance Log', phase: 'Findings Report' },
      { id: 'co-10', label: 'Agreed Action Plan', phase: 'Action Plan' },
      { id: 'co-11', label: 'Responsible Person Matrix', phase: 'Action Plan' },
      { id: 'co-12', label: 'Verification Report', phase: 'Follow-up Verification' },
      { id: 'co-13', label: 'Final Compliance Certificate', phase: 'Follow-up Verification' },
    ],
    budgetCategories: [
      { key: 'transportation_and_visit_fees', label: 'Transportation & Site Visit Fees', placeholder: '0.00' },
      { key: 'reviewer_fees', label: 'Compliance Reviewer Professional Fees', placeholder: '0.00' },
      { key: 'document_management', label: 'Document Management & Filing', placeholder: '0.00' },
      { key: 'internet_and_communication_fees', label: 'Internet & Communication', placeholder: '0.00' },
      { key: 'report_production', label: 'Report Production', placeholder: '0.00' },
      { key: 'management_overhead', label: 'Management & Overhead', placeholder: '0.00' },
    ],
    typicalTeamRoles: [
      { role: 'projectManager', count: 1 },
      { role: 'reviewer', count: 2 },
      { role: 'analyst', count: 1 },
    ],
    tabLabels: {
      planning: 'Compliance Checklist',
      reporting: 'Compliance Reports',
    },
    templateDefaults: {
      durationDays: 60,
      description: 'Compliance review to assess adherence to donor requirements, organisational policies, and applicable standards.',
    },
  },

  infrastructure: {
    label: 'Infrastructure',
    shortLabel: 'Infrastructure',
    description: 'Construction, rehabilitation, or installation of physical infrastructure.',
    deliverables: [
      { id: 'in-1', label: 'Feasibility Report', phase: 'Feasibility Study' },
      { id: 'in-2', label: 'Site Assessment', phase: 'Feasibility Study' },
      { id: 'in-3', label: 'Community Consultation Notes', phase: 'Feasibility Study' },
      { id: 'in-4', label: 'Technical Drawings', phase: 'Design & Planning' },
      { id: 'in-5', label: 'Bill of Quantities (BoQ)', phase: 'Design & Planning' },
      { id: 'in-6', label: 'Environmental Clearance', phase: 'Design & Planning' },
      { id: 'in-7', label: 'Procurement Report', phase: 'Procurement' },
      { id: 'in-8', label: 'Signed Contracts', phase: 'Procurement' },
      { id: 'in-9', label: 'Contractor Vetting Records', phase: 'Procurement' },
      { id: 'in-10', label: 'Progress Monitoring Reports', phase: 'Construction' },
      { id: 'in-11', label: 'Site Supervision Logs', phase: 'Construction' },
      { id: 'in-12', label: 'QA Inspection Reports', phase: 'Quality Assurance' },
      { id: 'in-13', label: 'Material Testing Certificates', phase: 'Quality Assurance' },
      { id: 'in-14', label: 'Snag List', phase: 'Quality Assurance' },
      { id: 'in-15', label: 'Handover Certificate', phase: 'Commissioning & Handover' },
      { id: 'in-16', label: 'As-built Drawings', phase: 'Commissioning & Handover' },
      { id: 'in-17', label: 'Operation & Maintenance Manual', phase: 'Commissioning & Handover' },
      { id: 'in-18', label: 'Post-Completion Review Report', phase: 'Post-Completion Review' },
    ],
    budgetCategories: [
      { key: 'construction_costs', label: 'Construction / Works Costs', placeholder: '0.00' },
      { key: 'materials', label: 'Materials & Equipment', placeholder: '0.00' },
      { key: 'contractor_fees', label: 'Contractor & Labour Fees', placeholder: '0.00' },
      { key: 'supervision_fees', label: 'Technical Supervision Fees', placeholder: '0.00' },
      { key: 'transportation_and_visit_fees', label: 'Transportation & Site Visits', placeholder: '0.00' },
      { key: 'permit_fee', label: 'Permits, Licences & Regulatory Fees', placeholder: '0.00' },
      { key: 'contingency', label: 'Contingency Reserve (5-10%)', placeholder: '0.00' },
      { key: 'management_overhead', label: 'Management & Overhead', placeholder: '0.00' },
    ],
    typicalTeamRoles: [
      { role: 'projectManager', count: 1 },
      { role: 'coordinator', count: 1 },
      { role: 'supervisor', count: 2 },
      { role: 'reviewer', count: 1 },
    ],
    tabLabels: {
      planning: 'Engineering Plans',
      reporting: 'Construction Reports',
    },
    templateDefaults: {
      durationDays: 365,
      description: 'Infrastructure project for the construction, rehabilitation, or installation of community or programme facilities.',
    },
  },

  proposal: {
    label: 'Proposal / Bid',
    shortLabel: 'Proposal',
    description: 'Pre-project stage to develop and submit a consultancy bid or funding proposal.',
    deliverables: [
      { id: 'pr-1', label: 'Opportunity Brief & Bid/No-bid Decision', phase: 'Opportunity Identified' },
      { id: 'pr-2', label: 'Competitor Landscape Summary', phase: 'Opportunity Identified' },
      { id: 'pr-3', label: 'Technical Proposal Draft', phase: 'Proposal Writing' },
      { id: 'pr-4', label: 'Financial Proposal / Budget', phase: 'Proposal Writing' },
      { id: 'pr-5', label: 'Team Composition Plan & CVs', phase: 'Proposal Writing' },
      { id: 'pr-6', label: 'Past Performance References', phase: 'Proposal Writing' },
      { id: 'pr-7', label: 'QA Review Comments Log', phase: 'Submission' },
      { id: 'pr-8', label: 'Compliance Checklist (Pre-Submission)', phase: 'Submission' },
      { id: 'pr-9', label: 'Submitted Proposal Package', phase: 'Submission' },
      { id: 'pr-10', label: 'Submission Confirmation', phase: 'Submission' },
      { id: 'pr-11', label: 'Clarification Q&A Log', phase: 'Submission' },
      { id: 'pr-12', label: 'Negotiation Meeting Notes', phase: 'Negotiation' },
      { id: 'pr-13', label: 'Revised Cost Proposal', phase: 'Negotiation' },
      { id: 'pr-14', label: 'Draft Contract', phase: 'Negotiation' },
      { id: 'pr-15', label: 'Award Letter / Rejection Notice', phase: 'Won / Lost' },
      { id: 'pr-16', label: 'Signed Contract (if Won)', phase: 'Won / Lost' },
      { id: 'pr-17', label: 'Lessons Learned Note', phase: 'Won / Lost' },
    ],
    budgetCategories: [
      { key: 'proposal_writing_fees', label: 'Proposal Writing & Technical Staff Time', placeholder: '0.00' },
      { key: 'printing_and_materials', label: 'Printing & Submission Materials', placeholder: '0.00' },
      { key: 'internet_and_communication_fees', label: 'Internet & Communication', placeholder: '0.00' },
      { key: 'review_fees', label: 'External Review / Advisory Fees', placeholder: '0.00' },
      { key: 'management_overhead', label: 'Management & Overhead', placeholder: '0.00' },
    ],
    typicalTeamRoles: [
      { role: 'projectManager', count: 1 },
      { role: 'analyst', count: 1 },
      { role: 'reviewer', count: 1 },
    ],
    tabLabels: {
      planning: 'Bid Strategy',
      reporting: 'Proposal Documents',
    },
    templateDefaults: {
      durationDays: 30,
      description: 'Proposal/bid development for a new consultancy engagement or funding opportunity.',
    },
  },

  other: {
    label: 'Other',
    shortLabel: 'Other',
    description: 'A general project type for engagements not covered by other categories.',
    deliverables: [
      { id: 'ot-1', label: 'Project Plan', phase: 'Planning' },
      { id: 'ot-2', label: 'Work Breakdown Structure', phase: 'Planning' },
      { id: 'ot-3', label: 'Activity Progress Reports', phase: 'Implementation' },
      { id: 'ot-4', label: 'Issue Log', phase: 'Implementation' },
      { id: 'ot-5', label: 'Project Completion Report', phase: 'Closure' },
      { id: 'ot-6', label: 'Lessons Learned Document', phase: 'Closure' },
    ],
    budgetCategories: [
      { key: 'transportation_and_visit_fees', label: 'Transportation & Logistics', placeholder: '0.00' },
      { key: 'personnel_fees', label: 'Personnel Fees', placeholder: '0.00' },
      { key: 'internet_and_communication_fees', label: 'Internet & Communication', placeholder: '0.00' },
      { key: 'permit_fee', label: 'Permits & Fees', placeholder: '0.00' },
      { key: 'management_overhead', label: 'Management & Overhead', placeholder: '0.00' },
    ],
    typicalTeamRoles: [
      { role: 'projectManager', count: 1 },
      { role: 'coordinator', count: 1 },
    ],
    tabLabels: {},
    templateDefaults: {
      durationDays: 90,
      description: 'General project engagement.',
    },
  },
};

export function getProjectTypeConfig(projectType: string): ProjectTypeConfig {
  return PROJECT_TYPE_CONFIGS[projectType] ?? PROJECT_TYPE_CONFIGS.other;
}

export const PROJECT_TEMPLATES = Object.entries(PROJECT_TYPE_CONFIGS).map(([type, config]) => ({
  type: type as ProjectType,
  label: config.label,
  shortLabel: config.shortLabel,
  description: config.description,
  durationDays: config.templateDefaults.durationDays,
  defaultDescription: config.templateDefaults.description,
  teamRoles: config.typicalTeamRoles,
  budgetCategories: config.budgetCategories,
}));
