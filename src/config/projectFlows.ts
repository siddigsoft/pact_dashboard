import type { ProjectType } from '@/types/project';

export interface FlowStage {
  id: string;
  label: string;
  description: string;
  linkedModule?: string;
  keyOutputs: string[];
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
  },
  {
    id: 'site_selection',
    label: 'Site Selection',
    description: 'Identify and verify sites to be monitored based on project coverage plan and partner data.',
    linkedModule: '/sites',
    keyOutputs: ['Site registry', 'Coverage plan', 'Geographical mapping'],
  },
  {
    id: 'mmp_design',
    label: 'MMP Design',
    description: 'Design Monthly Monitoring Plans, assign data collectors and supervisors, and get MMP approved.',
    linkedModule: '/mmp-management',
    keyOutputs: ['Approved MMP files', 'DC assignment list', 'Monitoring indicators'],
  },
  {
    id: 'enumerator_training',
    label: 'Enumerator Training',
    description: 'Train field data collectors on monitoring tools, protocols, and reporting procedures.',
    keyOutputs: ['Training agenda', 'Attendance register', 'Pre/post training test results'],
  },
  {
    id: 'field_verification',
    label: 'Field Verification',
    description: 'Conduct field site visits, verify beneficiary data, and document findings.',
    linkedModule: '/site-visits',
    keyOutputs: ['Verified site visit records', 'Photo documentation', 'Field observation notes'],
  },
  {
    id: 'data_processing',
    label: 'Data Processing',
    description: 'Collect, clean, and validate all field data. Cross-reference with partner records.',
    keyOutputs: ['Cleaned dataset', 'Data quality log', 'Validation summary'],
  },
  {
    id: 'reporting',
    label: 'Reporting',
    description: 'Analyse findings and produce TPM report with recommendations.',
    linkedModule: '/reports',
    keyOutputs: ['Draft TPM report', 'Final TPM report', 'Executive summary'],
  },
  {
    id: 'recommendations_tracking',
    label: 'Recommendations Tracking',
    description: 'Follow up on recommendations, track partner responses, and close the monitoring cycle.',
    keyOutputs: ['Recommendation tracker', 'Partner response log', 'Lessons learned note'],
  },
];

const BASELINE_SURVEY_FLOW: FlowStage[] = [
  {
    id: 'inception',
    label: 'Inception',
    description: 'Agree on survey objectives, scope, sampling approach, and timeline with the client.',
    keyOutputs: ['Inception report', 'Survey ToR', 'Sampling frame'],
  },
  {
    id: 'methodology_design',
    label: 'Methodology Design',
    description: 'Develop the sampling methodology, define indicators, and finalise the measurement framework.',
    keyOutputs: ['Methodology note', 'Indicator framework', 'Sampling design document'],
  },
  {
    id: 'tool_development',
    label: 'Tool Development',
    description: 'Design and translate survey questionnaires, set up digital data collection platform.',
    keyOutputs: ['Approved questionnaire', 'Digital form (ODK/KoBoToolbox)', 'Translation sign-off'],
  },
  {
    id: 'enumerator_training',
    label: 'Enumerator Training',
    description: 'Train field enumerators on the questionnaire, data quality standards, and safety protocols.',
    keyOutputs: ['Training attendance register', 'Pre/post test scores', 'Field protocol guide'],
  },
  {
    id: 'pilot',
    label: 'Pilot',
    description: 'Conduct a small-scale pilot to test the questionnaire and data collection process.',
    linkedModule: '/site-visits',
    keyOutputs: ['Pilot report', 'Revised questionnaire', 'Lessons from pilot'],
  },
  {
    id: 'data_collection',
    label: 'Data Collection',
    description: 'Full-scale field data collection across all sampled locations.',
    linkedModule: '/site-visits',
    keyOutputs: ['Completed submissions', 'Daily progress reports', 'Field supervisor logs'],
  },
  {
    id: 'data_cleaning',
    label: 'Data Cleaning',
    description: 'Clean, validate, and document all collected data before analysis.',
    keyOutputs: ['Clean dataset', 'Data cleaning log', 'Outlier and missing data report'],
  },
  {
    id: 'analysis',
    label: 'Analysis',
    description: 'Analyse the clean dataset and produce statistical outputs and visualisations.',
    keyOutputs: ['Statistical tables', 'Charts and infographics', 'Analytical narrative'],
  },
  {
    id: 'report_dissemination',
    label: 'Report Writing & Dissemination',
    description: 'Draft, review, and finalise the baseline report. Disseminate findings to stakeholders.',
    linkedModule: '/reports',
    keyOutputs: ['Draft baseline report', 'Final baseline report', 'Dissemination record'],
  },
];

const ENDLINE_SURVEY_FLOW: FlowStage[] = [
  {
    id: 'inception',
    label: 'Inception',
    description: 'Review baseline findings, agree on endline scope, and confirm comparison indicators.',
    keyOutputs: ['Endline inception report', 'Comparison framework', 'Revised sampling frame'],
  },
  {
    id: 'methodology_design',
    label: 'Methodology Design',
    description: 'Confirm methodology changes from baseline and finalise the endline measurement plan.',
    keyOutputs: ['Endline methodology note', 'Indicator tracking matrix'],
  },
  {
    id: 'tool_development',
    label: 'Tool Development',
    description: 'Update or redevelop survey tools based on baseline learnings and new programme context.',
    keyOutputs: ['Updated questionnaire', 'Digital form', 'Translation sign-off'],
  },
  {
    id: 'enumerator_training',
    label: 'Enumerator Training',
    description: 'Train enumerators, emphasising changes from the baseline and lessons learned.',
    keyOutputs: ['Training attendance register', 'Pre/post test scores'],
  },
  {
    id: 'pilot',
    label: 'Pilot',
    description: 'Pilot the revised tools to confirm feasibility and data quality.',
    linkedModule: '/site-visits',
    keyOutputs: ['Pilot report', 'Final revised tools'],
  },
  {
    id: 'data_collection',
    label: 'Data Collection',
    description: 'Full-scale field data collection, matching baseline coverage where feasible.',
    linkedModule: '/site-visits',
    keyOutputs: ['Completed submissions', 'Daily progress reports'],
  },
  {
    id: 'data_cleaning',
    label: 'Data Cleaning',
    description: 'Clean and validate data, cross-checking with baseline records for panel consistency.',
    keyOutputs: ['Clean endline dataset', 'Comparison-ready dataset', 'Data cleaning log'],
  },
  {
    id: 'analysis',
    label: 'Analysis',
    description: 'Analyse changes from baseline, compute outcome indicators, and measure programme impact.',
    keyOutputs: ['Change analysis tables', 'Impact indicators', 'Statistical significance tests'],
  },
  {
    id: 'report_dissemination',
    label: 'Report Writing & Dissemination',
    description: 'Produce the endline report comparing results to baseline and documenting impact.',
    linkedModule: '/reports',
    keyOutputs: ['Draft endline report', 'Final endline report', 'Baseline-endline comparison table'],
  },
];

const ASSESSMENT_FLOW: FlowStage[] = [
  {
    id: 'inception',
    label: 'Inception',
    description: 'Clarify assessment objectives, scope, target population, and methodology with the client.',
    keyOutputs: ['Inception report', 'Assessment framework', 'Work plan'],
  },
  {
    id: 'methodology_design',
    label: 'Methodology Design',
    description: 'Design the assessment approach including data collection methods and analysis plan.',
    keyOutputs: ['Methodology note', 'Assessment matrix', 'Sampling strategy'],
  },
  {
    id: 'tool_development',
    label: 'Tool Development',
    description: 'Develop assessment tools (questionnaires, checklists, FGD guides, KII guides).',
    keyOutputs: ['Data collection tools', 'Interview guides', 'Translation and back-translation'],
  },
  {
    id: 'enumerator_training',
    label: 'Enumerator Training',
    description: 'Train field teams on assessment tools, ethical standards, and data quality.',
    keyOutputs: ['Training attendance register', 'Field protocol', 'Competency assessment results'],
  },
  {
    id: 'data_collection',
    label: 'Data Collection',
    description: 'Conduct field data collection including surveys, interviews, and focus group discussions.',
    linkedModule: '/site-visits',
    keyOutputs: ['Completed data forms', 'Interview transcripts', 'FGD notes'],
  },
  {
    id: 'data_cleaning',
    label: 'Data Cleaning & Validation',
    description: 'Clean, validate, and triangulate data from multiple sources.',
    keyOutputs: ['Clean dataset', 'Data validation log', 'Triangulation summary'],
  },
  {
    id: 'analysis',
    label: 'Analysis',
    description: 'Analyse quantitative and qualitative data to answer the assessment questions.',
    keyOutputs: ['Quantitative analysis tables', 'Qualitative themes', 'Key findings summary'],
  },
  {
    id: 'report_validation',
    label: 'Report Writing & Validation',
    description: 'Write the assessment report, validate findings with stakeholders, and finalise.',
    linkedModule: '/reports',
    keyOutputs: ['Draft assessment report', 'Stakeholder validation notes', 'Final assessment report'],
  },
];

const EVALUATION_FLOW: FlowStage[] = [
  {
    id: 'inception',
    label: 'Inception',
    description: 'Review programme documents, develop the evaluation matrix, and confirm methodology.',
    keyOutputs: ['Inception report', 'Evaluation matrix', 'Theory of Change review', 'Work plan'],
  },
  {
    id: 'methodology_design',
    label: 'Methodology Design',
    description: 'Finalise the evaluation design, data sources, and sampling approach.',
    keyOutputs: ['Evaluation methodology note', 'Data source map', 'Sampling design'],
  },
  {
    id: 'tool_development',
    label: 'Tool Development',
    description: 'Develop evaluation tools: surveys, KII guides, document review checklists.',
    keyOutputs: ['Evaluation questionnaire', 'KII and FGD guides', 'Document review checklist'],
  },
  {
    id: 'data_collection',
    label: 'Data Collection',
    description: 'Collect primary and secondary data across all evaluation dimensions.',
    linkedModule: '/site-visits',
    keyOutputs: ['Survey data', 'Interview transcripts', 'Secondary data analysis'],
  },
  {
    id: 'data_analysis',
    label: 'Data Analysis',
    description: 'Analyse data against the evaluation criteria (relevance, effectiveness, efficiency, impact, sustainability).',
    keyOutputs: ['Analysis tables', 'OECD-DAC criteria scoring', 'Findings matrix'],
  },
  {
    id: 'draft_report',
    label: 'Draft Report',
    description: 'Produce the draft evaluation report with findings, conclusions, and recommendations.',
    keyOutputs: ['Draft evaluation report', 'Executive summary'],
  },
  {
    id: 'stakeholder_validation',
    label: 'Stakeholder Validation',
    description: 'Present draft findings to key stakeholders for validation and comments.',
    keyOutputs: ['Validation workshop report', 'Comment log', 'Management response draft'],
  },
  {
    id: 'final_report',
    label: 'Final Report',
    description: 'Revise and finalise the evaluation report incorporating stakeholder feedback.',
    linkedModule: '/reports',
    keyOutputs: ['Final evaluation report', 'Management response', 'Evaluation summary sheet'],
  },
  {
    id: 'learning_session',
    label: 'Learning & Recommendations Session',
    description: 'Facilitate a learning session with programme staff to internalise recommendations.',
    keyOutputs: ['Learning session report', 'Action plan for recommendations', 'Dissemination record'],
  },
];

const RESEARCH_FLOW: FlowStage[] = [
  {
    id: 'concept_note',
    label: 'Concept Note',
    description: 'Develop and get approval for the research concept note including objectives, methodology, and budget.',
    keyOutputs: ['Approved concept note', 'Research proposal', 'Budget plan'],
  },
  {
    id: 'ethics_approvals',
    label: 'Ethics & Approvals',
    description: 'Obtain ethical approval, research permits, and any required government clearances.',
    keyOutputs: ['Ethics certificate', 'Research permit', 'Government clearance letter'],
  },
  {
    id: 'instrument_development',
    label: 'Instrument Development',
    description: 'Design, pre-test, and finalise all data collection instruments.',
    keyOutputs: ['Research instruments', 'Pre-test report', 'Coding framework'],
  },
  {
    id: 'data_collection',
    label: 'Data Collection',
    description: 'Collect primary data through field research, surveys, or secondary data gathering.',
    linkedModule: '/site-visits',
    keyOutputs: ['Primary dataset', 'Interview recordings/transcripts', 'Field notes'],
  },
  {
    id: 'data_analysis',
    label: 'Data Analysis',
    description: 'Analyse data using appropriate quantitative and/or qualitative methods.',
    keyOutputs: ['Analysis outputs', 'Statistical results', 'Thematic codes and themes'],
  },
  {
    id: 'draft_writeup',
    label: 'Draft Write-up',
    description: 'Write the first draft of the research paper or report.',
    keyOutputs: ['Draft research paper/report', 'Bibliography', 'Data annexes'],
  },
  {
    id: 'peer_review',
    label: 'Peer Review & Revision',
    description: 'Submit for internal or external peer review and revise based on feedback.',
    keyOutputs: ['Peer review comments', 'Revision log', 'Revised manuscript'],
  },
  {
    id: 'publication',
    label: 'Publication & Dissemination',
    description: 'Finalise, publish, and disseminate the research findings to target audiences.',
    linkedModule: '/reports',
    keyOutputs: ['Published report/paper', 'Dissemination plan', 'Media or presentation materials'],
  },
];

const CAPACITY_BUILDING_FLOW: FlowStage[] = [
  {
    id: 'needs_assessment',
    label: 'Needs Assessment',
    description: 'Conduct a Training Needs Assessment (TNA) to identify capacity gaps and priority areas.',
    keyOutputs: ['TNA report', 'Capacity gap analysis', 'Prioritised training areas'],
  },
  {
    id: 'curriculum_design',
    label: 'Curriculum Design',
    description: 'Design the training curriculum, schedule, and learning objectives.',
    keyOutputs: ['Training plan', 'Session schedule', 'Learning objectives matrix'],
  },
  {
    id: 'material_development',
    label: 'Material Development',
    description: 'Develop all facilitator and participant training materials.',
    keyOutputs: ["Facilitator's guide", "Participant's workbook", 'Presentation slides', 'Exercises and handouts'],
  },
  {
    id: 'training_delivery',
    label: 'Training Delivery',
    description: 'Facilitate the training programme with all target participants.',
    keyOutputs: ['Attendance register', 'Pre/post test results', 'Daily session evaluations'],
  },
  {
    id: 'post_training_assessment',
    label: 'Post-Training Assessment',
    description: 'Assess knowledge and skill transfer through tests, observations, or follow-up interviews.',
    keyOutputs: ['Assessment results', 'Competency verification report', 'Certification records'],
  },
  {
    id: 'followup_mentoring',
    label: 'Follow-up & Mentoring',
    description: 'Provide on-the-job coaching and follow-up support to consolidate learning.',
    linkedModule: '/site-visits',
    keyOutputs: ['Follow-up visit records', 'Mentoring session notes', 'Capacity improvement report'],
  },
];

const COMPLIANCE_FLOW: FlowStage[] = [
  {
    id: 'kickoff',
    label: 'Kickoff',
    description: 'Agree on scope, standards to be assessed, key contacts, and review schedule.',
    keyOutputs: ['Review plan', 'Compliance checklist', 'Document request list'],
  },
  {
    id: 'document_review',
    label: 'Document Review',
    description: 'Review all submitted policy, financial, and operational documents against compliance standards.',
    keyOutputs: ['Document review matrix', 'Initial findings log', 'Information gap list'],
  },
  {
    id: 'field_verification',
    label: 'Field Verification',
    description: 'Conduct site visits to verify physical compliance and interview key staff.',
    linkedModule: '/site-visits',
    keyOutputs: ['Field visit reports', 'Interview notes', 'Photo evidence'],
  },
  {
    id: 'findings_report',
    label: 'Findings Report',
    description: 'Compile all findings into a structured compliance report with risk ratings.',
    keyOutputs: ['Draft findings report', 'Risk rating matrix', 'Non-compliance log'],
  },
  {
    id: 'action_plan',
    label: 'Action Plan',
    description: 'Agree on a corrective action plan with the reviewed entity to address all findings.',
    keyOutputs: ['Agreed action plan', 'Timeline for remediation', 'Responsible person matrix'],
  },
  {
    id: 'followup_verification',
    label: 'Follow-up Verification',
    description: 'Verify that corrective actions have been implemented and close the compliance review.',
    linkedModule: '/site-visits',
    keyOutputs: ['Verification report', 'Closed findings log', 'Final compliance certificate'],
  },
];

const INFRASTRUCTURE_FLOW: FlowStage[] = [
  {
    id: 'feasibility',
    label: 'Feasibility Study',
    description: 'Assess technical, financial, and social feasibility of the infrastructure project.',
    keyOutputs: ['Feasibility report', 'Site assessment', 'Community consultation notes'],
  },
  {
    id: 'design_planning',
    label: 'Design & Planning',
    description: 'Develop technical designs, prepare bills of quantities, and obtain approvals.',
    keyOutputs: ['Technical drawings', 'Bill of Quantities (BoQ)', 'Environmental clearance'],
  },
  {
    id: 'procurement',
    label: 'Procurement',
    description: 'Advertise, evaluate, and award contracts to qualified contractors.',
    keyOutputs: ['Procurement report', 'Signed contracts', 'Contractor vetting records'],
  },
  {
    id: 'construction',
    label: 'Construction',
    description: 'Supervise and monitor construction progress against approved designs and timelines.',
    linkedModule: '/site-visits',
    keyOutputs: ['Progress monitoring reports', 'Site supervision logs', 'Variation orders (if any)'],
  },
  {
    id: 'quality_assurance',
    label: 'Quality Assurance',
    description: 'Conduct quality checks, test construction materials, and verify specifications.',
    keyOutputs: ['QA inspection reports', 'Material testing certificates', 'Snag list'],
  },
  {
    id: 'commissioning_handover',
    label: 'Commissioning & Handover',
    description: 'Commission the completed infrastructure and formally hand over to the community or client.',
    keyOutputs: ['Handover certificate', 'As-built drawings', 'Operation & maintenance manual'],
  },
  {
    id: 'post_completion_review',
    label: 'Post-Completion Review',
    description: 'Assess performance and community satisfaction after a defined period of operation.',
    keyOutputs: ['Post-completion review report', 'Lessons learned', 'Maintenance schedule'],
  },
];

const OTHER_FLOW: FlowStage[] = [
  {
    id: 'planning',
    label: 'Planning',
    description: 'Define the project scope, objectives, activities, and resource requirements.',
    keyOutputs: ['Project plan', 'Work breakdown structure'],
  },
  {
    id: 'implementation',
    label: 'Implementation',
    description: 'Execute planned activities and monitor progress against the plan.',
    keyOutputs: ['Activity progress reports', 'Issue log'],
  },
  {
    id: 'closure',
    label: 'Closure & Review',
    description: 'Complete all activities, document lessons learned, and formally close the project.',
    linkedModule: '/reports',
    keyOutputs: ['Project completion report', 'Lessons learned document'],
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
  { value: 'other', label: 'Other' },
];
