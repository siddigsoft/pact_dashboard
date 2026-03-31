import '../models/project_model.dart';

// Dart port of src/config/projectFlows.ts — keeps stage definitions in sync
// with the web app.

const _tpmFlow = [
  ProjectFlowStage(id: 'inception', label: 'Inception', description: 'Finalise scope, key stakeholders, and inception report. Establish coordination with implementing partners.', keyOutputs: ['Inception report', 'Stakeholder mapping', 'Work plan']),
  ProjectFlowStage(id: 'site_selection', label: 'Site Selection', description: 'Identify and verify sites to be monitored based on project coverage plan and partner data.', keyOutputs: ['Site registry', 'Coverage plan', 'Geographical mapping']),
  ProjectFlowStage(id: 'mmp_design', label: 'MMP Design', description: 'Design Monthly Monitoring Plans, assign data collectors and supervisors, and get MMP approved.', keyOutputs: ['Approved MMP files', 'DC assignment list', 'Monitoring indicators']),
  ProjectFlowStage(id: 'enumerator_training', label: 'Enumerator Training', description: 'Train field data collectors on monitoring tools, protocols, and reporting procedures.', keyOutputs: ['Training agenda', 'Attendance register', 'Pre/post training test results']),
  ProjectFlowStage(id: 'field_verification', label: 'Field Verification', description: 'Conduct field site visits, verify beneficiary data, and document findings.', keyOutputs: ['Verified site visit records', 'Photo documentation', 'Field observation notes']),
  ProjectFlowStage(id: 'data_processing', label: 'Data Processing', description: 'Collect, clean, and validate all field data. Cross-reference with partner records.', keyOutputs: ['Cleaned dataset', 'Data quality log', 'Validation summary']),
  ProjectFlowStage(id: 'reporting', label: 'Reporting', description: 'Analyse findings and produce TPM report with recommendations.', keyOutputs: ['Draft TPM report', 'Final TPM report', 'Executive summary']),
  ProjectFlowStage(id: 'recommendations_tracking', label: 'Recommendations Tracking', description: 'Follow up on recommendations, track partner responses, and close the monitoring cycle.', keyOutputs: ['Recommendation tracker', 'Partner response log', 'Lessons learned note']),
];

const _baselineSurveyFlow = [
  ProjectFlowStage(id: 'inception', label: 'Inception', description: 'Agree on survey objectives, scope, sampling approach, and timeline with the client.', keyOutputs: ['Inception report', 'Survey ToR', 'Sampling frame']),
  ProjectFlowStage(id: 'methodology_design', label: 'Methodology Design', description: 'Develop the sampling methodology, define indicators, and finalise the measurement framework.', keyOutputs: ['Methodology note', 'Indicator framework', 'Sampling design document']),
  ProjectFlowStage(id: 'tool_development', label: 'Tool Development', description: 'Design and translate survey questionnaires, set up digital data collection platform.', keyOutputs: ['Approved questionnaire', 'Digital form', 'Translation sign-off']),
  ProjectFlowStage(id: 'enumerator_training', label: 'Enumerator Training', description: 'Train field enumerators on the questionnaire, data quality standards, and safety protocols.', keyOutputs: ['Training attendance register', 'Pre/post test scores', 'Field protocol guide']),
  ProjectFlowStage(id: 'pilot', label: 'Pilot', description: 'Conduct a small-scale pilot to test the questionnaire and data collection process.', keyOutputs: ['Pilot report', 'Revised questionnaire', 'Updated field protocol']),
  ProjectFlowStage(id: 'data_collection', label: 'Data Collection', description: 'Execute full-scale data collection across all sampled sites and populations.', keyOutputs: ['Completed surveys', 'Daily progress reports', 'Quality control log']),
  ProjectFlowStage(id: 'data_processing', label: 'Data Processing', description: 'Clean, code, and validate collected data for analysis.', keyOutputs: ['Cleaned dataset', 'Data quality report', 'Codebook']),
  ProjectFlowStage(id: 'analysis', label: 'Analysis', description: 'Perform statistical analysis and interpret findings against baseline indicators.', keyOutputs: ['Analysis plan', 'Statistical outputs', 'Key findings summary']),
  ProjectFlowStage(id: 'reporting', label: 'Reporting', description: 'Produce the baseline survey report with findings and recommendations.', keyOutputs: ['Draft report', 'Final baseline report', 'Data tables']),
];

const _assessmentFlow = [
  ProjectFlowStage(id: 'inception', label: 'Inception', description: 'Define assessment scope, questions, methodology, and timeline.', keyOutputs: ['Inception report', 'Assessment ToR', 'Data collection plan']),
  ProjectFlowStage(id: 'tool_development', label: 'Tool Development', description: 'Develop assessment tools including questionnaires, KII guides, and FGD protocols.', keyOutputs: ['Data collection tools', 'Translation', 'Piloting plan']),
  ProjectFlowStage(id: 'field_data_collection', label: 'Field Data Collection', description: 'Collect primary data through surveys, interviews, FGDs, and observations.', keyOutputs: ['Survey data', 'Interview transcripts', 'FGD notes']),
  ProjectFlowStage(id: 'analysis', label: 'Analysis', description: 'Analyse collected data against assessment questions and frameworks.', keyOutputs: ['Analysis outputs', 'Key themes', 'Preliminary findings']),
  ProjectFlowStage(id: 'reporting', label: 'Reporting', description: 'Produce the assessment report with findings, conclusions, and recommendations.', keyOutputs: ['Draft report', 'Validated findings', 'Final report']),
];

const _otherFlow = [
  ProjectFlowStage(id: 'planning', label: 'Planning', description: 'Define the project scope, objectives, activities, and resource requirements.', keyOutputs: ['Project plan', 'Work breakdown structure']),
  ProjectFlowStage(id: 'implementation', label: 'Implementation', description: 'Execute planned activities and monitor progress against the plan.', keyOutputs: ['Activity progress reports', 'Issue log']),
  ProjectFlowStage(id: 'closure', label: 'Closure & Review', description: 'Complete all activities, document lessons learned, and formally close the project.', keyOutputs: ['Project completion report', 'Lessons learned document']),
];

const _infrastructureFlow = [
  ProjectFlowStage(id: 'feasibility', label: 'Feasibility Study', description: 'Assess technical, financial, and social feasibility of the infrastructure project.', keyOutputs: ['Feasibility report', 'Site assessment', 'Community consultation notes']),
  ProjectFlowStage(id: 'design_planning', label: 'Design & Planning', description: 'Develop technical designs, prepare bills of quantities, and obtain approvals.', keyOutputs: ['Technical drawings', 'Bill of Quantities (BoQ)', 'Environmental clearance']),
  ProjectFlowStage(id: 'procurement', label: 'Procurement', description: 'Advertise, evaluate, and award contracts to qualified contractors.', keyOutputs: ['Procurement report', 'Signed contracts', 'Contractor vetting records']),
  ProjectFlowStage(id: 'construction', label: 'Construction', description: 'Supervise and monitor construction progress against approved designs and timelines.', keyOutputs: ['Progress monitoring reports', 'Site supervision logs', 'Variation orders (if any)']),
  ProjectFlowStage(id: 'quality_assurance', label: 'Quality Assurance', description: 'Conduct quality checks, test construction materials, and verify specifications.', keyOutputs: ['QA inspection reports', 'Material testing certificates', 'Snag list']),
  ProjectFlowStage(id: 'commissioning_handover', label: 'Commissioning & Handover', description: 'Commission the completed infrastructure and formally hand over to the community or client.', keyOutputs: ['Handover certificate', 'As-built drawings', 'Operation & maintenance manual']),
  ProjectFlowStage(id: 'post_completion_review', label: 'Post-Completion Review', description: 'Assess performance and community satisfaction after a defined period of operation.', keyOutputs: ['Post-completion review report', 'Lessons learned', 'Maintenance schedule']),
];

const _capacityBuildingFlow = [
  ProjectFlowStage(id: 'needs_assessment', label: 'Needs Assessment', description: 'Identify training needs, knowledge gaps, and capacity challenges among target participants.', keyOutputs: ['Needs assessment report', 'Gap analysis', 'Participant mapping']),
  ProjectFlowStage(id: 'curriculum_design', label: 'Curriculum Design', description: 'Develop training curriculum, materials, and facilitator guides.', keyOutputs: ['Training curriculum', 'Facilitator guide', 'Participant handbook']),
  ProjectFlowStage(id: 'training_delivery', label: 'Training Delivery', description: 'Deliver training sessions to participants using interactive and practical methodologies.', keyOutputs: ['Training attendance register', 'Session reports', 'Pre/post-test results']),
  ProjectFlowStage(id: 'post_training_support', label: 'Post-Training Support', description: 'Provide coaching, mentoring, and on-the-job support after training.', keyOutputs: ['Coaching reports', 'Follow-up visit records', 'Support log']),
  ProjectFlowStage(id: 'evaluation', label: 'Evaluation', description: 'Assess training effectiveness and measure change in knowledge, skills, and behaviour.', keyOutputs: ['Evaluation report', 'Learning outcomes summary', 'Recommendations']),
];

const _evaluationFlow = [
  ProjectFlowStage(id: 'inception', label: 'Inception', description: 'Define evaluation questions, methodology, and scope with the commissioning party.', keyOutputs: ['Inception report', 'Evaluation matrix', 'Work plan']),
  ProjectFlowStage(id: 'desk_review', label: 'Desk Review', description: 'Review programme documents, previous reports, and secondary data.', keyOutputs: ['Desk review summary', 'Document matrix', 'Key information gaps']),
  ProjectFlowStage(id: 'field_data_collection', label: 'Field Data Collection', description: 'Collect primary data through mixed methods including surveys, interviews, and FGDs.', keyOutputs: ['Survey data', 'Interview transcripts', 'FGD notes']),
  ProjectFlowStage(id: 'analysis', label: 'Analysis', description: 'Triangulate and analyse data against evaluation questions and criteria.', keyOutputs: ['Analysis outputs', 'Preliminary findings', 'Validation workshop notes']),
  ProjectFlowStage(id: 'reporting', label: 'Reporting', description: 'Draft and finalise the evaluation report.', keyOutputs: ['Draft report', 'Stakeholder feedback', 'Final evaluation report']),
];

const _researchFlow = [
  ProjectFlowStage(id: 'inception', label: 'Inception', description: 'Define research questions, methodology, ethics clearance, and timeline.', keyOutputs: ['Research proposal', 'Ethics clearance', 'Work plan']),
  ProjectFlowStage(id: 'literature_review', label: 'Literature Review', description: 'Review existing evidence and secondary data relevant to the research topic.', keyOutputs: ['Literature review', 'Evidence gap analysis']),
  ProjectFlowStage(id: 'data_collection', label: 'Data Collection', description: 'Collect primary data using the approved research methodology.', keyOutputs: ['Primary data', 'Data quality log', 'Field notes']),
  ProjectFlowStage(id: 'analysis', label: 'Analysis', description: 'Analyse and interpret data against research questions.', keyOutputs: ['Analysis outputs', 'Coded data', 'Preliminary findings']),
  ProjectFlowStage(id: 'reporting', label: 'Reporting', description: 'Write and publish the research report or paper.', keyOutputs: ['Draft research report', 'Peer review', 'Final report']),
];

const _complianceFlow = [
  ProjectFlowStage(id: 'kickoff', label: 'Kickoff', description: 'Agree on scope, standards to be assessed, key contacts, and review schedule.', keyOutputs: ['Review plan', 'Compliance checklist', 'Document request list']),
  ProjectFlowStage(id: 'document_review', label: 'Document Review', description: 'Review all submitted policy, financial, and operational documents against compliance standards.', keyOutputs: ['Document review matrix', 'Initial findings log', 'Information gap list']),
  ProjectFlowStage(id: 'field_verification', label: 'Field Verification', description: 'Conduct site visits to verify physical compliance and interview key staff.', keyOutputs: ['Field visit reports', 'Interview notes', 'Photo evidence']),
  ProjectFlowStage(id: 'findings_report', label: 'Findings Report', description: 'Compile all findings into a structured compliance report with risk ratings.', keyOutputs: ['Draft findings report', 'Risk rating matrix', 'Non-compliance log']),
  ProjectFlowStage(id: 'action_plan', label: 'Action Plan', description: 'Agree on a corrective action plan with the reviewed entity to address all findings.', keyOutputs: ['Agreed action plan', 'Timeline for remediation', 'Responsible person matrix']),
  ProjectFlowStage(id: 'followup_verification', label: 'Follow-up Verification', description: 'Verify that corrective actions have been implemented and close the compliance review.', keyOutputs: ['Verification report', 'Closed findings log', 'Final compliance certificate']),
];

const Map<String, List<ProjectFlowStage>> kProjectFlows = {
  'tpm': _tpmFlow,
  'baseline_survey': _baselineSurveyFlow,
  'endline_survey': _baselineSurveyFlow,
  'assessment': _assessmentFlow,
  'evaluation': _evaluationFlow,
  'research': _researchFlow,
  'capacity_building': _capacityBuildingFlow,
  'compliance': _complianceFlow,
  'infrastructure': _infrastructureFlow,
  'other': _otherFlow,
  'survey': _baselineSurveyFlow,
  'monitoring': _tpmFlow,
  'training': _capacityBuildingFlow,
};

const Map<String, String> kProjectTypeLabels = {
  'tpm': 'Third Party Monitoring',
  'baseline_survey': 'Baseline Survey',
  'endline_survey': 'Endline Survey',
  'assessment': 'Field Assessment',
  'evaluation': 'Programme Evaluation',
  'research': 'Research Study',
  'capacity_building': 'Capacity Building',
  'compliance': 'Compliance Review',
  'infrastructure': 'Infrastructure',
  'other': 'Other',
};

List<ProjectFlowStage> getProjectFlow(String? projectType) {
  return kProjectFlows[projectType ?? 'other'] ?? _otherFlow;
}

String getProjectTypeLabel(String? projectType) {
  return kProjectTypeLabels[projectType ?? 'other'] ?? 'Other';
}

String getFirstStageId(String? projectType) {
  final flow = getProjectFlow(projectType);
  return flow.isNotEmpty ? flow.first.id : 'planning';
}
