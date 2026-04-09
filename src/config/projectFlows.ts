import type { ProjectType } from '@/types/project';

export type StageActionIcon =
  | 'hub' | 'hub-map' | 'mmp' | 'visits' | 'reports'
  | 'budget' | 'costs' | 'docs' | 'staff' | 'finance' | 'wallet';

export interface StageAction {
  label: string;
  route: string;
  icon: StageActionIcon;
}

export interface FlowStage {
  id: string;
  label: string;
  description: string;
  linkedModule?: string;
  linkedActions?: StageAction[];
  keyOutputs: string[];
  typicalDurationDays?: number;
}

export interface ProjectFlow {
  type: ProjectType;
  label: string;
  stages: FlowStage[];
}

const TPM_FLOW: FlowStage[] = [
  {
    id: 'inception',
    label: 'Inception',
    description: 'Finalise scope, key stakeholders, and inception report. Establish coordination with implementing partners.',
    keyOutputs: ['Inception report', 'Stakeholder mapping', 'Work plan'],
    typicalDurationDays: 14,
  },
  {
    id: 'site_selection',
    label: 'Site Selection',
    description: 'Identify and verify sites to be monitored based on project coverage plan and partner data.',
    linkedModule: '/hub-operations',
    linkedActions: [
      { label: 'Site Registry', route: '/hub-operations', icon: 'hub' },
      { label: 'Hub Map & Coverage', route: '/hub-management', icon: 'hub-map' },
    ],
    keyOutputs: ['Site registry', 'Coverage plan', 'Geographical mapping'],
    typicalDurationDays: 7,
  },
  {
    id: 'mmp_design',
    label: 'MMP Design',
    description: 'Design Monthly Monitoring Plans, assign data collectors and supervisors, and get MMP approved.',
    linkedModule: '/mmp-management',
    linkedActions: [
      { label: 'MMP Management', route: '/mmp-management', icon: 'mmp' },
      { label: 'Staff Directory', route: '/staff-directory', icon: 'staff' },
    ],
    keyOutputs: ['Approved MMP files', 'DC assignment list', 'Monitoring indicators'],
    typicalDurationDays: 7,
  },
  {
    id: 'enumerator_training',
    label: 'Enumerator Training',
    description: 'Train field data collectors on monitoring tools, protocols, and reporting procedures.',
    linkedActions: [
      { label: 'Staff Directory', route: '/staff-directory', icon: 'staff' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Training agenda', 'Attendance register', 'Pre/post training test results'],
    typicalDurationDays: 3,
  },
  {
    id: 'field_verification',
    label: 'Field Verification',
    description: 'Conduct field site visits, verify beneficiary data, and document findings.',
    linkedModule: '/site-visits',
    linkedActions: [
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
      { label: 'Hub Operations', route: '/hub-operations', icon: 'hub' },
    ],
    keyOutputs: ['Verified site visit records', 'Photo documentation', 'Field observation notes'],
    typicalDurationDays: 30,
  },
  {
    id: 'data_processing',
    label: 'Data Processing',
    description: 'Collect, clean, and validate all field data. Cross-reference with partner records.',
    linkedActions: [
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Cleaned dataset', 'Data quality log', 'Validation summary'],
    typicalDurationDays: 10,
  },
  {
    id: 'reporting',
    label: 'Reporting',
    description: 'Analyse findings and produce TPM report with recommendations.',
    linkedModule: '/reports',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Draft TPM report', 'Final TPM report', 'Executive summary'],
    typicalDurationDays: 14,
  },
  {
    id: 'recommendations_tracking',
    label: 'Recommendations Tracking',
    description: 'Follow up on recommendations, track partner responses, and close the monitoring cycle.',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
    ],
    keyOutputs: ['Recommendation tracker', 'Partner response log', 'Lessons learned note'],
    typicalDurationDays: 14,
  },
];

const BASELINE_SURVEY_FLOW: FlowStage[] = [
  {
    id: 'inception',
    label: 'Inception',
    description: 'Agree on survey objectives, scope, sampling approach, and timeline with the client.',
    keyOutputs: ['Inception report', 'Survey ToR', 'Sampling frame'],
    typicalDurationDays: 14,
  },
  {
    id: 'methodology_design',
    label: 'Methodology Design',
    description: 'Develop the sampling methodology, define indicators, and finalise the measurement framework.',
    keyOutputs: ['Methodology note', 'Indicator framework', 'Sampling design document'],
    typicalDurationDays: 10,
  },
  {
    id: 'tool_development',
    label: 'Tool Development',
    description: 'Design and translate survey questionnaires, set up digital data collection platform.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Approved questionnaire', 'Digital form (ODK/KoBoToolbox)', 'Translation sign-off'],
    typicalDurationDays: 14,
  },
  {
    id: 'enumerator_training',
    label: 'Enumerator Training',
    description: 'Train field enumerators on the questionnaire, data quality standards, and safety protocols.',
    linkedActions: [
      { label: 'Staff Directory', route: '/staff-directory', icon: 'staff' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Training attendance register', 'Pre/post test scores', 'Field protocol guide'],
    typicalDurationDays: 5,
  },
  {
    id: 'pilot',
    label: 'Pilot',
    description: 'Conduct a small-scale pilot to test the questionnaire and data collection process.',
    linkedModule: '/site-visits',
    linkedActions: [
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
      { label: 'Hub Operations', route: '/hub-operations', icon: 'hub' },
    ],
    keyOutputs: ['Pilot report', 'Revised questionnaire', 'Lessons from pilot'],
    typicalDurationDays: 5,
  },
  {
    id: 'data_collection',
    label: 'Data Collection',
    description: 'Full-scale field data collection across all sampled locations.',
    linkedModule: '/site-visits',
    linkedActions: [
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
      { label: 'MMP Management', route: '/mmp-management', icon: 'mmp' },
    ],
    keyOutputs: ['Completed submissions', 'Daily progress reports', 'Field supervisor logs'],
    typicalDurationDays: 30,
  },
  {
    id: 'data_cleaning',
    label: 'Data Cleaning',
    description: 'Clean, validate, and document all collected data before analysis.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Clean dataset', 'Data cleaning log', 'Outlier and missing data report'],
    typicalDurationDays: 14,
  },
  {
    id: 'analysis',
    label: 'Analysis',
    description: 'Analyse the clean dataset and produce statistical outputs and visualisations.',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
    ],
    keyOutputs: ['Statistical tables', 'Charts and infographics', 'Analytical narrative'],
    typicalDurationDays: 14,
  },
  {
    id: 'report_dissemination',
    label: 'Report Writing & Dissemination',
    description: 'Draft, review, and finalise the baseline report. Disseminate findings to stakeholders.',
    linkedModule: '/reports',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Draft baseline report', 'Final baseline report', 'Dissemination record'],
    typicalDurationDays: 14,
  },
];

const ENDLINE_SURVEY_FLOW: FlowStage[] = [
  {
    id: 'inception',
    label: 'Inception',
    description: 'Review baseline findings, agree on endline scope, and confirm comparison indicators.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Endline inception report', 'Comparison framework', 'Revised sampling frame'],
    typicalDurationDays: 14,
  },
  {
    id: 'methodology_design',
    label: 'Methodology Design',
    description: 'Confirm methodology changes from baseline and finalise the endline measurement plan.',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
    ],
    keyOutputs: ['Endline methodology note', 'Indicator tracking matrix'],
    typicalDurationDays: 10,
  },
  {
    id: 'tool_development',
    label: 'Tool Development',
    description: 'Update or redevelop survey tools based on baseline learnings and new programme context.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Updated questionnaire', 'Digital form', 'Translation sign-off'],
    typicalDurationDays: 10,
  },
  {
    id: 'enumerator_training',
    label: 'Enumerator Training',
    description: 'Train enumerators, emphasising changes from the baseline and lessons learned.',
    linkedActions: [
      { label: 'Staff Directory', route: '/staff-directory', icon: 'staff' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Training attendance register', 'Pre/post test scores'],
    typicalDurationDays: 5,
  },
  {
    id: 'pilot',
    label: 'Pilot',
    description: 'Pilot the revised tools to confirm feasibility and data quality.',
    linkedModule: '/site-visits',
    linkedActions: [
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
      { label: 'Hub Operations', route: '/hub-operations', icon: 'hub' },
    ],
    keyOutputs: ['Pilot report', 'Final revised tools'],
    typicalDurationDays: 5,
  },
  {
    id: 'data_collection',
    label: 'Data Collection',
    description: 'Full-scale field data collection, matching baseline coverage where feasible.',
    linkedModule: '/site-visits',
    linkedActions: [
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
      { label: 'MMP Management', route: '/mmp-management', icon: 'mmp' },
    ],
    keyOutputs: ['Completed submissions', 'Daily progress reports'],
    typicalDurationDays: 30,
  },
  {
    id: 'data_cleaning',
    label: 'Data Cleaning',
    description: 'Clean and validate data, cross-checking with baseline records for panel consistency.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Clean endline dataset', 'Comparison-ready dataset', 'Data cleaning log'],
    typicalDurationDays: 14,
  },
  {
    id: 'analysis',
    label: 'Analysis',
    description: 'Analyse changes from baseline, compute outcome indicators, and measure programme impact.',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
    ],
    keyOutputs: ['Change analysis tables', 'Impact indicators', 'Statistical significance tests'],
    typicalDurationDays: 14,
  },
  {
    id: 'report_dissemination',
    label: 'Report Writing & Dissemination',
    description: 'Produce the endline report comparing results to baseline and documenting impact.',
    linkedModule: '/reports',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Draft endline report', 'Final endline report', 'Baseline-endline comparison table'],
    typicalDurationDays: 14,
  },
];

const ASSESSMENT_FLOW: FlowStage[] = [
  {
    id: 'inception',
    label: 'Inception',
    description: 'Clarify assessment objectives, scope, target population, and methodology with the client.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Inception report', 'Assessment framework', 'Work plan'],
    typicalDurationDays: 10,
  },
  {
    id: 'methodology_design',
    label: 'Methodology Design',
    description: 'Design the assessment approach including data collection methods and analysis plan.',
    linkedActions: [
      { label: 'Hub Operations', route: '/hub-operations', icon: 'hub' },
    ],
    keyOutputs: ['Methodology note', 'Assessment matrix', 'Sampling strategy'],
    typicalDurationDays: 7,
  },
  {
    id: 'tool_development',
    label: 'Tool Development',
    description: 'Develop assessment tools (questionnaires, checklists, FGD guides, KII guides).',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Data collection tools', 'Interview guides', 'Translation and back-translation'],
    typicalDurationDays: 7,
  },
  {
    id: 'enumerator_training',
    label: 'Enumerator Training',
    description: 'Train field teams on assessment tools, ethical standards, and data quality.',
    linkedActions: [
      { label: 'Staff Directory', route: '/staff-directory', icon: 'staff' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Training attendance register', 'Field protocol', 'Competency assessment results'],
    typicalDurationDays: 3,
  },
  {
    id: 'data_collection',
    label: 'Data Collection',
    description: 'Conduct field data collection including surveys, interviews, and focus group discussions.',
    linkedModule: '/site-visits',
    linkedActions: [
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
      { label: 'Hub Operations', route: '/hub-operations', icon: 'hub' },
    ],
    keyOutputs: ['Completed data forms', 'Interview transcripts', 'FGD notes'],
    typicalDurationDays: 14,
  },
  {
    id: 'data_cleaning',
    label: 'Data Cleaning & Validation',
    description: 'Clean, validate, and triangulate data from multiple sources.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Clean dataset', 'Data validation log', 'Triangulation summary'],
    typicalDurationDays: 7,
  },
  {
    id: 'analysis',
    label: 'Analysis',
    description: 'Analyse quantitative and qualitative data to answer the assessment questions.',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
    ],
    keyOutputs: ['Quantitative analysis tables', 'Qualitative themes', 'Key findings summary'],
    typicalDurationDays: 7,
  },
  {
    id: 'report_validation',
    label: 'Report Writing & Validation',
    description: 'Write the assessment report, validate findings with stakeholders, and finalise.',
    linkedModule: '/reports',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Draft assessment report', 'Stakeholder validation notes', 'Final assessment report'],
    typicalDurationDays: 10,
  },
];

const EVALUATION_FLOW: FlowStage[] = [
  {
    id: 'inception',
    label: 'Inception',
    description: 'Review programme documents, develop the evaluation matrix, and confirm methodology.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Inception report', 'Evaluation matrix', 'Theory of Change review', 'Work plan'],
    typicalDurationDays: 21,
  },
  {
    id: 'methodology_design',
    label: 'Methodology Design',
    description: 'Finalise the evaluation design, data sources, and sampling approach.',
    linkedActions: [
      { label: 'Hub Operations', route: '/hub-operations', icon: 'hub' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Evaluation methodology note', 'Data source map', 'Sampling design'],
    typicalDurationDays: 14,
  },
  {
    id: 'tool_development',
    label: 'Tool Development',
    description: 'Develop evaluation tools: surveys, KII guides, document review checklists.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Evaluation questionnaire', 'KII and FGD guides', 'Document review checklist'],
    typicalDurationDays: 10,
  },
  {
    id: 'data_collection',
    label: 'Data Collection',
    description: 'Collect primary and secondary data across all evaluation dimensions.',
    linkedModule: '/site-visits',
    linkedActions: [
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
      { label: 'Hub Operations', route: '/hub-operations', icon: 'hub' },
    ],
    keyOutputs: ['Survey data', 'Interview transcripts', 'Secondary data analysis'],
    typicalDurationDays: 21,
  },
  {
    id: 'data_analysis',
    label: 'Data Analysis',
    description: 'Analyse data against the evaluation criteria (relevance, effectiveness, efficiency, impact, sustainability).',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
    ],
    keyOutputs: ['Analysis tables', 'OECD-DAC criteria scoring', 'Findings matrix'],
    typicalDurationDays: 21,
  },
  {
    id: 'draft_report',
    label: 'Draft Report',
    description: 'Produce the draft evaluation report with findings, conclusions, and recommendations.',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Draft evaluation report', 'Executive summary'],
    typicalDurationDays: 21,
  },
  {
    id: 'stakeholder_validation',
    label: 'Stakeholder Validation',
    description: 'Present draft findings to key stakeholders for validation and comments.',
    linkedActions: [
      { label: 'Staff Directory', route: '/staff-directory', icon: 'staff' },
    ],
    keyOutputs: ['Validation workshop report', 'Comment log', 'Management response draft'],
    typicalDurationDays: 7,
  },
  {
    id: 'final_report',
    label: 'Final Report',
    description: 'Revise and finalise the evaluation report incorporating stakeholder feedback.',
    linkedModule: '/reports',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Final evaluation report', 'Management response', 'Evaluation summary sheet'],
    typicalDurationDays: 14,
  },
  {
    id: 'learning_session',
    label: 'Learning & Recommendations Session',
    description: 'Facilitate a learning session with programme staff to internalise recommendations.',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
      { label: 'Staff Directory', route: '/staff-directory', icon: 'staff' },
    ],
    keyOutputs: ['Learning session report', 'Action plan for recommendations', 'Dissemination record'],
    typicalDurationDays: 7,
  },
];

const RESEARCH_FLOW: FlowStage[] = [
  {
    id: 'concept_note',
    label: 'Concept Note',
    description: 'Develop and get approval for the research concept note including objectives, methodology, and budget.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
      { label: 'Budget', route: '/budget', icon: 'budget' },
    ],
    keyOutputs: ['Approved concept note', 'Research proposal', 'Budget plan'],
    typicalDurationDays: 14,
  },
  {
    id: 'ethics_approvals',
    label: 'Ethics & Approvals',
    description: 'Obtain ethical approval, research permits, and any required government clearances.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Ethics certificate', 'Research permit', 'Government clearance letter'],
    typicalDurationDays: 30,
  },
  {
    id: 'instrument_development',
    label: 'Instrument Development',
    description: 'Design, pre-test, and finalise all data collection instruments.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Research instruments', 'Pre-test report', 'Coding framework'],
    typicalDurationDays: 14,
  },
  {
    id: 'data_collection',
    label: 'Data Collection',
    description: 'Collect primary data through field research, surveys, or secondary data gathering.',
    linkedModule: '/site-visits',
    linkedActions: [
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
      { label: 'Hub Operations', route: '/hub-operations', icon: 'hub' },
    ],
    keyOutputs: ['Primary dataset', 'Interview recordings/transcripts', 'Field notes'],
    typicalDurationDays: 30,
  },
  {
    id: 'data_analysis',
    label: 'Data Analysis',
    description: 'Analyse data using appropriate quantitative and/or qualitative methods.',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
    ],
    keyOutputs: ['Analysis outputs', 'Statistical results', 'Thematic codes and themes'],
    typicalDurationDays: 21,
  },
  {
    id: 'draft_writeup',
    label: 'Draft Write-up',
    description: 'Write the first draft of the research paper or report.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Draft research paper/report', 'Bibliography', 'Data annexes'],
    typicalDurationDays: 21,
  },
  {
    id: 'peer_review',
    label: 'Peer Review & Revision',
    description: 'Submit for internal or external peer review and revise based on feedback.',
    linkedActions: [
      { label: 'Staff Directory', route: '/staff-directory', icon: 'staff' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Peer review comments', 'Revision log', 'Revised manuscript'],
    typicalDurationDays: 14,
  },
  {
    id: 'publication',
    label: 'Publication & Dissemination',
    description: 'Finalise, publish, and disseminate the research findings to target audiences.',
    linkedModule: '/reports',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Published report/paper', 'Dissemination plan', 'Media or presentation materials'],
    typicalDurationDays: 14,
  },
];

const CAPACITY_BUILDING_FLOW: FlowStage[] = [
  {
    id: 'needs_assessment',
    label: 'Needs Assessment',
    description: 'Conduct a Training Needs Assessment (TNA) to identify capacity gaps and priority areas.',
    linkedActions: [
      { label: 'Staff Directory', route: '/staff-directory', icon: 'staff' },
      { label: 'Reports', route: '/reports', icon: 'reports' },
    ],
    keyOutputs: ['TNA report', 'Capacity gap analysis', 'Prioritised training areas'],
    typicalDurationDays: 10,
  },
  {
    id: 'curriculum_design',
    label: 'Curriculum Design',
    description: 'Design the training curriculum, schedule, and learning objectives.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Training plan', 'Session schedule', 'Learning objectives matrix'],
    typicalDurationDays: 7,
  },
  {
    id: 'material_development',
    label: 'Material Development',
    description: 'Develop all facilitator and participant training materials.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ["Facilitator's guide", "Participant's workbook", 'Presentation slides', 'Exercises and handouts'],
    typicalDurationDays: 10,
  },
  {
    id: 'training_delivery',
    label: 'Training Delivery',
    description: 'Facilitate the training programme with all target participants.',
    linkedActions: [
      { label: 'Staff Directory', route: '/staff-directory', icon: 'staff' },
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
    ],
    keyOutputs: ['Attendance register', 'Pre/post test results', 'Daily session evaluations'],
    typicalDurationDays: 5,
  },
  {
    id: 'post_training_assessment',
    label: 'Post-Training Assessment',
    description: 'Assess knowledge and skill transfer through tests, observations, or follow-up interviews.',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
      { label: 'Staff Directory', route: '/staff-directory', icon: 'staff' },
    ],
    keyOutputs: ['Assessment results', 'Competency verification report', 'Certification records'],
    typicalDurationDays: 7,
  },
  {
    id: 'followup_mentoring',
    label: 'Follow-up & Mentoring',
    description: 'Provide on-the-job coaching and follow-up support to consolidate learning.',
    linkedModule: '/site-visits',
    linkedActions: [
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
      { label: 'Reports', route: '/reports', icon: 'reports' },
    ],
    keyOutputs: ['Follow-up visit records', 'Mentoring session notes', 'Capacity improvement report'],
    typicalDurationDays: 30,
  },
];

const COMPLIANCE_FLOW: FlowStage[] = [
  {
    id: 'kickoff',
    label: 'Kickoff',
    description: 'Agree on scope, standards to be assessed, key contacts, and review schedule.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
      { label: 'Staff Directory', route: '/staff-directory', icon: 'staff' },
    ],
    keyOutputs: ['Review plan', 'Compliance checklist', 'Document request list'],
    typicalDurationDays: 5,
  },
  {
    id: 'document_review',
    label: 'Document Review',
    description: 'Review all submitted policy, financial, and operational documents against compliance standards.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
      { label: 'Finance', route: '/finance', icon: 'finance' },
    ],
    keyOutputs: ['Document review matrix', 'Initial findings log', 'Information gap list'],
    typicalDurationDays: 10,
  },
  {
    id: 'field_verification',
    label: 'Field Verification',
    description: 'Conduct site visits to verify physical compliance and interview key staff.',
    linkedModule: '/site-visits',
    linkedActions: [
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
      { label: 'Hub Operations', route: '/hub-operations', icon: 'hub' },
    ],
    keyOutputs: ['Field visit reports', 'Interview notes', 'Photo evidence'],
    typicalDurationDays: 7,
  },
  {
    id: 'findings_report',
    label: 'Findings Report',
    description: 'Compile all findings into a structured compliance report with risk ratings.',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Draft findings report', 'Risk rating matrix', 'Non-compliance log'],
    typicalDurationDays: 10,
  },
  {
    id: 'action_plan',
    label: 'Action Plan',
    description: 'Agree on a corrective action plan with the reviewed entity to address all findings.',
    linkedActions: [
      { label: 'Staff Directory', route: '/staff-directory', icon: 'staff' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Agreed action plan', 'Timeline for remediation', 'Responsible person matrix'],
    typicalDurationDays: 7,
  },
  {
    id: 'followup_verification',
    label: 'Follow-up Verification',
    description: 'Verify that corrective actions have been implemented and close the compliance review.',
    linkedModule: '/site-visits',
    linkedActions: [
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
      { label: 'Reports', route: '/reports', icon: 'reports' },
    ],
    keyOutputs: ['Verification report', 'Closed findings log', 'Final compliance certificate'],
    typicalDurationDays: 14,
  },
];

const INFRASTRUCTURE_FLOW: FlowStage[] = [
  {
    id: 'feasibility',
    label: 'Feasibility Study',
    description: 'Assess technical, financial, and social feasibility of the infrastructure project.',
    linkedActions: [
      { label: 'Hub Operations', route: '/hub-operations', icon: 'hub' },
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
      { label: 'Budget', route: '/budget', icon: 'budget' },
    ],
    keyOutputs: ['Feasibility report', 'Site assessment', 'Community consultation notes'],
    typicalDurationDays: 21,
  },
  {
    id: 'design_planning',
    label: 'Design & Planning',
    description: 'Develop technical designs, prepare bills of quantities, and obtain approvals.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
      { label: 'Budget', route: '/budget', icon: 'budget' },
    ],
    keyOutputs: ['Technical drawings', 'Bill of Quantities (BoQ)', 'Environmental clearance'],
    typicalDurationDays: 30,
  },
  {
    id: 'procurement',
    label: 'Procurement',
    description: 'Advertise, evaluate, and award contracts to qualified contractors.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
      { label: 'Finance', route: '/finance', icon: 'finance' },
    ],
    keyOutputs: ['Procurement report', 'Signed contracts', 'Contractor vetting records'],
    typicalDurationDays: 30,
  },
  {
    id: 'construction',
    label: 'Construction',
    description: 'Supervise and monitor construction progress against approved designs and timelines.',
    linkedModule: '/site-visits',
    linkedActions: [
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
      { label: 'Costs & Finance', route: '/finance', icon: 'costs' },
      { label: 'Hub Map', route: '/hub-management', icon: 'hub-map' },
    ],
    keyOutputs: ['Progress monitoring reports', 'Site supervision logs', 'Variation orders (if any)'],
    typicalDurationDays: 90,
  },
  {
    id: 'quality_assurance',
    label: 'Quality Assurance',
    description: 'Conduct quality checks, test construction materials, and verify specifications.',
    linkedActions: [
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['QA inspection reports', 'Material testing certificates', 'Snag list'],
    typicalDurationDays: 14,
  },
  {
    id: 'commissioning_handover',
    label: 'Commissioning & Handover',
    description: 'Commission the completed infrastructure and formally hand over to the community or client.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
      { label: 'Reports', route: '/reports', icon: 'reports' },
    ],
    keyOutputs: ['Handover certificate', 'As-built drawings', 'Operation & maintenance manual'],
    typicalDurationDays: 7,
  },
  {
    id: 'post_completion_review',
    label: 'Post-Completion Review',
    description: 'Assess performance and community satisfaction after a defined period of operation.',
    linkedActions: [
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
      { label: 'Reports', route: '/reports', icon: 'reports' },
    ],
    keyOutputs: ['Post-completion review report', 'Lessons learned', 'Maintenance schedule'],
    typicalDurationDays: 14,
  },
];

const OTHER_FLOW: FlowStage[] = [
  {
    id: 'planning',
    label: 'Planning',
    description: 'Define the project scope, objectives, activities, and resource requirements.',
    linkedActions: [
      { label: 'Budget', route: '/budget', icon: 'budget' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Project plan', 'Work breakdown structure'],
    typicalDurationDays: 14,
  },
  {
    id: 'implementation',
    label: 'Implementation',
    description: 'Execute planned activities and monitor progress against the plan.',
    linkedActions: [
      { label: 'Site Visits', route: '/site-visits', icon: 'visits' },
      { label: 'Finance', route: '/finance', icon: 'finance' },
    ],
    keyOutputs: ['Activity progress reports', 'Issue log'],
    typicalDurationDays: 60,
  },
  {
    id: 'closure',
    label: 'Closure & Review',
    description: 'Complete all activities, document lessons learned, and formally close the project.',
    linkedModule: '/reports',
    linkedActions: [
      { label: 'Reports', route: '/reports', icon: 'reports' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Project completion report', 'Lessons learned document'],
    typicalDurationDays: 14,
  },
];

const PROPOSAL_FLOW: FlowStage[] = [
  {
    id: 'opportunity_identified',
    label: 'Opportunity Identified',
    description: 'Log and qualify the opportunity. Define the bid/no-bid decision criteria and assign a bid lead.',
    linkedActions: [
      { label: 'CRM Opportunities', route: '/crm/opportunities', icon: 'docs' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Opportunity brief', 'Bid/no-bid decision note', 'Competitor landscape summary'],
    typicalDurationDays: 3,
  },
  {
    id: 'proposal_writing',
    label: 'Proposal Writing',
    description: 'Develop the technical and financial proposal including methodology, team CVs, and work plan.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
      { label: 'Staff Directory', route: '/staff-directory', icon: 'staff' },
      { label: 'Budget', route: '/budget', icon: 'budget' },
    ],
    keyOutputs: ['Technical proposal draft', 'Budget/financial proposal', 'Team composition plan', 'CVs and past performance'],
    typicalDurationDays: 14,
  },
  {
    id: 'submission',
    label: 'Submission',
    description: 'Submit the final proposal to the client or contracting authority by the deadline.',
    linkedActions: [
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Submitted proposal package', 'Submission confirmation', 'Clarification log'],
    typicalDurationDays: 1,
  },
  {
    id: 'negotiation',
    label: 'Negotiation',
    description: 'Engage in contract negotiations, respond to clarifications, and finalise terms.',
    linkedActions: [
      { label: 'CRM Opportunities', route: '/crm/opportunities', icon: 'docs' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
      { label: 'Finance', route: '/finance', icon: 'finance' },
    ],
    keyOutputs: ['Negotiation meeting notes', 'Revised cost proposal', 'Draft contract'],
    typicalDurationDays: 14,
  },
  {
    id: 'won_lost',
    label: 'Won / Lost',
    description: 'Record the final outcome of the bid. If won, initiate project setup. If lost, capture lessons learned.',
    linkedActions: [
      { label: 'CRM Opportunities', route: '/crm/opportunities', icon: 'docs' },
      { label: 'Documents', route: '/documents', icon: 'docs' },
    ],
    keyOutputs: ['Award letter / rejection notice', 'Contract (if won)', 'Lessons learned note'],
    typicalDurationDays: 1,
  },
];

export const PROJECT_FLOWS: Record<string, ProjectFlow> = {
  tpm: { type: 'tpm', label: 'Third Party Monitoring', stages: TPM_FLOW },
  baseline_survey: { type: 'baseline_survey', label: 'Baseline Survey', stages: BASELINE_SURVEY_FLOW },
  endline_survey: { type: 'endline_survey', label: 'Endline Survey', stages: ENDLINE_SURVEY_FLOW },
  assessment: { type: 'assessment', label: 'Field Assessment', stages: ASSESSMENT_FLOW },
  evaluation: { type: 'evaluation', label: 'Programme Evaluation', stages: EVALUATION_FLOW },
  research: { type: 'research', label: 'Research Study', stages: RESEARCH_FLOW },
  capacity_building: { type: 'capacity_building', label: 'Capacity Building', stages: CAPACITY_BUILDING_FLOW },
  compliance: { type: 'compliance', label: 'Compliance Review', stages: COMPLIANCE_FLOW },
  infrastructure: { type: 'infrastructure', label: 'Infrastructure', stages: INFRASTRUCTURE_FLOW },
  proposal: { type: 'proposal', label: 'Proposal / Bid', stages: PROPOSAL_FLOW },
  other: { type: 'other', label: 'Other', stages: OTHER_FLOW },
  // Legacy type aliases — map to nearest equivalent flow
  survey: { type: 'baseline_survey', label: 'Survey (Legacy)', stages: BASELINE_SURVEY_FLOW },
  monitoring: { type: 'tpm', label: 'Monitoring (Legacy)', stages: TPM_FLOW },
  training: { type: 'capacity_building', label: 'Training (Legacy)', stages: CAPACITY_BUILDING_FLOW },
};

export function getProjectFlow(projectType: string): ProjectFlow {
  return PROJECT_FLOWS[projectType] ?? PROJECT_FLOWS.other;
}

export function getFirstStageId(projectType: string): string {
  const flow = getProjectFlow(projectType);
  return flow.stages[0]?.id ?? 'planning';
}

export const PROJECT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'tpm', label: 'Third Party Monitoring (TPM)' },
  { value: 'baseline_survey', label: 'Baseline Survey' },
  { value: 'endline_survey', label: 'Endline Survey' },
  { value: 'assessment', label: 'Field Assessment' },
  { value: 'evaluation', label: 'Programme Evaluation' },
  { value: 'research', label: 'Research Study' },
  { value: 'capacity_building', label: 'Capacity Building' },
  { value: 'compliance', label: 'Compliance Review' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'proposal', label: 'Proposal / Bid' },
  { value: 'other', label: 'Other' },
];
