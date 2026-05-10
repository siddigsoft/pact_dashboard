-- =============================================================================
-- Populate all questions for the Staff Restructuring Survey (short_code = kcsebnqb)
-- Run once in Supabase SQL editor.
-- WARNING: This DELETES all existing questions for this survey and re-creates them.
-- =============================================================================

DO $$
DECLARE
  v_survey_id uuid;
  v_idx       int := 0;

  FUNCTION nq(
    p_type        text,
    p_label       text,
    p_label_ar    text DEFAULT NULL,
    p_required    bool DEFAULT false,
    p_options     text[] DEFAULT NULL,
    p_options_ar  text[] DEFAULT NULL,
    p_settings    jsonb DEFAULT '{}',
    p_desc        text DEFAULT NULL,
    p_desc_ar     text DEFAULT NULL
  ) RETURNS void LANGUAGE plpgsql AS $fn$
  BEGIN
    v_idx := v_idx + 1;
    INSERT INTO survey_questions (
      id, survey_id, type, label, label_ar, description, description_ar,
      required, options, options_ar, settings, order_index, group_id
    ) VALUES (
      gen_random_uuid(), v_survey_id, p_type, p_label, p_label_ar,
      p_desc, p_desc_ar,
      p_required, p_options, p_options_ar, p_settings, v_idx, NULL
    );
  END $fn$;

BEGIN
  -- 1. Find the survey
  SELECT id INTO v_survey_id
  FROM surveys
  WHERE short_code = 'kcsebnqb';

  IF v_survey_id IS NULL THEN
    RAISE EXCEPTION 'Survey with short_code "kcsebnqb" not found.';
  END IF;

  -- 2. Clear existing questions
  DELETE FROM survey_questions WHERE survey_id = v_survey_id;

  -- ─────────────────────────────────────────────────────────────────────
  -- SECTION 1: Staff Profile
  -- ─────────────────────────────────────────────────────────────────────
  PERFORM nq('section_header', 'Staff Profile', 'بيانات الموظف');

  PERFORM nq('text', 'Full name', 'الاسم الكامل', true,
    NULL, NULL, '{"variable_name":"full_name"}');

  PERFORM nq('text', 'Current title / role', 'المسمى الوظيفي / الدور الحالي', true,
    NULL, NULL, '{"variable_name":"current_title"}');

  PERFORM nq('text', 'Department / function currently assigned to',
    'الإدارة / القسم الذي تتبع له حالياً', true,
    NULL, NULL, '{"variable_name":"department"}');

  PERFORM nq('text', 'Country / duty location', 'البلد / موقع العمل', true,
    NULL, NULL, '{"variable_name":"country"}');

  PERFORM nq('dropdown', 'Contract type', 'نوع التعاقد', true,
    ARRAY['Full-time','Part-time','Retainer / consultant','Volunteer','Other'],
    ARRAY['دوام كامل','دوام جزئي','متعاقد / مستشار','متطوع','أخرى'],
    '{"variable_name":"contract_type"}');

  PERFORM nq('text', 'If other contract type, please specify',
    'إذا كانت الإجابة "أخرى"، يرجى التحديد', false,
    NULL, NULL,
    '{"variable_name":"contract_type_other","skip_logic":{"conditions":[{"question_id":"contract_type","operator":"equals","value":"Other"}],"logic":"AND"}}');

  PERFORM nq('text', 'Reports to (current Line Manager)',
    'من هو مديرك المباشر الحالي', true,
    NULL, NULL, '{"variable_name":"reports_to"}');

  PERFORM nq('text', 'If applicable, who reports to you?',
    'في حال كنت أنت المدير المباشر، من هم الأشخاص الذين يعملون تحت إشرافك؟', false,
    NULL, NULL, '{"variable_name":"reports_to_me"}');

  PERFORM nq('text', 'How long have you been working with PACT?',
    'منذ متى وأنت تعمل مع باكت؟', true,
    NULL, NULL, '{"variable_name":"tenure_pact"}');

  -- ─────────────────────────────────────────────────────────────────────
  -- SECTION 2: Understanding of Current Role
  -- ─────────────────────────────────────────────────────────────────────
  PERFORM nq('section_header', 'Understanding of Current Role',
    'فهم الدور الحالي');

  PERFORM nq('textarea',
    'In your own words, what is your current role at PACT?',
    'من منظورك الشخصي، ما هو دورك الحالي في باكت؟', true,
    NULL, NULL, '{"variable_name":"current_role_description"}');

  PERFORM nq('radio',
    'Do you feel your current role is clearly defined?',
    'هل ترى أن مهامك الوظيفية محددة بوضوح؟', true,
    ARRAY['Yes','Partly','No'],
    ARRAY['نعم','إلى حد ما','لا'],
    '{"variable_name":"role_clearly_defined"}');

  PERFORM nq('textarea',
    'If Partly or No, what is unclear?',
    'إذا كانت الإجابة "إلى حد ما" أو "لا"، فما الجوانب التي ما زالت غير واضحة؟', false,
    NULL, NULL,
    '{"variable_name":"role_unclear_details"}');

  PERFORM nq('radio',
    'Do you have a written ToR / JD / Assignment for your role?',
    'هل لديك عقد كتابي أو وصف وظيفي يحدد نطاق عملك؟', true,
    ARRAY['Yes','No'],
    ARRAY['نعم','لا'],
    '{"variable_name":"has_written_tor"}');

  PERFORM nq('radio',
    'Does your day-to-day work match your formal role?',
    'هل يتوافق عملك اليومي مع مهام وظيفتك الحالية؟', true,
    ARRAY['Yes','Partly','No'],
    ARRAY['نعم','إلى حد ما','لا'],
    '{"variable_name":"work_matches_role"}');

  PERFORM nq('textarea',
    'If No or Partly, what is different in practice?',
    'إذا كانت الإجابة "لا" أو "إلى حد ما"، فما الفرق في الواقع؟', false,
    NULL, NULL,
    '{"variable_name":"work_mismatch_details"}');

  -- ─────────────────────────────────────────────────────────────────────
  -- SECTION 3: Current Work and Recent Contribution
  -- ─────────────────────────────────────────────────────────────────────
  PERFORM nq('section_header', 'Current Work and Recent Contribution',
    'المهام الحالية والمساهمات الأخيرة');

  PERFORM nq('textarea',
    'What are your top 5 current responsibilities?',
    'ما هي أهم 5 مسؤوليات تتولى القيام بها حالياً؟', true,
    NULL, NULL,
    '{"variable_name":"top_responsibilities"}',
    'List them in order of priority.',
    'رتّبها حسب الأولوية.');

  PERFORM nq('textarea',
    'What work are you mainly doing now in practice?',
    'ما هي المهام التي تقوم بها بشكل أساسي في منصبك الحالي؟', true,
    NULL, NULL,
    '{"variable_name":"current_work_in_practice"}');

  PERFORM nq('grid_table',
    'What have you completed or contributed to in the last 30 days?',
    'ما الذي أنجزته أو ساهمت فيه خلال الثلاثين يوماً الماضية؟', false,
    NULL, NULL,
    '{"variable_name":"last_30_days","grid_columns":[{"id":"priority","label":"Priority","type":"text"},{"id":"project","label":"Project / Initiative","type":"text"},{"id":"task","label":"Task / Activity","type":"text"},{"id":"start_date","label":"Start Date","type":"date"},{"id":"end_date","label":"End Date","type":"date"},{"id":"duration","label":"Time / Effort","type":"text"},{"id":"role","label":"Your Role","type":"text"},{"id":"outcome","label":"Outcome / Deliverable","type":"text"},{"id":"comments","label":"Comments","type":"text"}],"min_rows":1,"max_rows":10}',
    'Rank activities by priority. Include project/initiative, task, priority, time spent, dates, role, outcome, and comments.',
    'رتّب الأنشطة حسب الأولوية.');

  PERFORM nq('grid_table',
    'What are you planning or expected to work on in the next 30 days?',
    'ما الذي تخطط للعمل عليه أو يُتوقع منك العمل عليه خلال الثلاثين يوماً القادمة؟', false,
    NULL, NULL,
    '{"variable_name":"next_30_days","grid_columns":[{"id":"priority","label":"Priority","type":"text"},{"id":"project","label":"Project / Initiative","type":"text"},{"id":"task","label":"Planned Task / Activity","type":"text"},{"id":"start_date","label":"Planned Start Date","type":"date"},{"id":"end_date","label":"Planned End Date","type":"date"},{"id":"duration","label":"Estimated Time / Effort","type":"text"},{"id":"role","label":"Your Role","type":"text"},{"id":"outcome","label":"Expected Outcome","type":"text"},{"id":"dependencies","label":"Dependencies / Approvals","type":"text"},{"id":"comments","label":"Comments","type":"text"}],"min_rows":1,"max_rows":10}');

  PERFORM nq('textarea',
    'Which of your current tasks add the most value to PACT?',
    'أي من مهامك الحالية يحقق أكبر قيمة مضافة لباكت؟', false,
    NULL, NULL,
    '{"variable_name":"high_value_tasks"}');

  PERFORM nq('textarea',
    'Which of your current tasks could be reassigned, simplified, or stopped?',
    'أي من مهامك الحالية يمكن إعادة إسناده أو تبسيطه أو إلغاؤه؟', false,
    NULL, NULL,
    '{"variable_name":"tasks_to_reassign"}');

  -- ─────────────────────────────────────────────────────────────────────
  -- SECTION 4: Reporting, Approvals, and Coordination
  -- ─────────────────────────────────────────────────────────────────────
  PERFORM nq('section_header', 'Reporting, Approvals, and Coordination',
    'الإشراف والموافقات والتنسيق');

  PERFORM nq('radio',
    'Do you clearly know who you report to, who approves of your work, and who you coordinate with most often?',
    'هل تعرف بوضوح من ترفع إليه تقاريرك، ومن يعتمد عملك، ومع من تنسق بصورة متكررة؟', true,
    ARRAY['Yes','Partly','No'],
    ARRAY['نعم','إلى حد ما','لا'],
    '{"variable_name":"know_reporting_lines"}');

  PERFORM nq('textarea',
    'What approvals do you regularly need to perform your work?',
    'ما أنواع الموافقات التي تحتاج إليها بصورة منتظمة لتنفيذ عملك؟', false,
    NULL, NULL,
    '{"variable_name":"regular_approvals"}');

  PERFORM nq('textarea',
    'If there are approval delays, where do they most often happen?',
    'إذا كان هناك تأخير في الموافقات، فأين يحدث غالباً؟', false,
    NULL, NULL,
    '{"variable_name":"approval_delays"}');

  PERFORM nq('textarea',
    'Which departments / people do you rely on most to complete your work?',
    'ما الأقسام أو الأشخاص الذين تعتمد عليهم أكثر من غيرهم لإنجاز عملك؟', false,
    NULL, NULL,
    '{"variable_name":"key_dependencies"}');

  PERFORM nq('checkbox',
    'What usually slows work down in your area?',
    'ما الذي يبطئ العمل غالباً في مجالك؟', false,
    ARRAY['Waiting for approval','Waiting for input','Unclear responsibilities','Staff capacity','Delayed communication','Systems / tools','Other'],
    ARRAY['انتظار الموافقة','انتظار المدخلات','عدم وضوح المسؤوليات','ضعف قدرات الموظفين','ضعف التواصل','الأنظمة / الأدوات','أخرى'],
    '{"variable_name":"work_slowdowns"}');

  PERFORM nq('radio',
    'Do you think information is shared clearly enough across departments?',
    'هل ترى أن المعلومات تُشارك بوضوح كافٍ بين الأقسام؟', true,
    ARRAY['Yes','Partly','No'],
    ARRAY['نعم','إلى حد ما','لا'],
    '{"variable_name":"info_sharing_clarity"}');

  PERFORM nq('checkbox',
    'What kind of regular coordination would help most?',
    'ما نوع التنسيق الدوري الذي من شأنه أن يساعد أكثر؟', false,
    ARRAY['More regular department meetings','More regular heads of department meetings','Better action tracking','Clearer escalation path','Better reporting','Other'],
    ARRAY['اجتماعات أكثر انتظاماً على مستوى الأقسام','اجتماعات أكثر انتظاماً لرؤساء الأقسام','تحسين متابعة الإجراءات','مسار تصعيد أكثر وضوحاً','تحسين آلية رفع التقارير','أخرى'],
    '{"variable_name":"coordination_needs"}');

  -- ─────────────────────────────────────────────────────────────────────
  -- SECTION 5: Role Fit and Department Alignment
  -- ─────────────────────────────────────────────────────────────────────
  PERFORM nq('section_header', 'Role Fit and Department Alignment',
    'ملاءمة الوظيفة وتوافق التخصص مع القسم');

  PERFORM nq('radio',
    'Do you think your current department''s placement is the right one?',
    'هل ترى أنك حالياً تعمل في القسم أو المكان المناسب؟', true,
    ARRAY['Yes','No'],
    ARRAY['نعم','لا'],
    '{"variable_name":"dept_placement_right"}');

  PERFORM nq('textarea',
    'If not, where do you think your role would fit better, and why?',
    'إذا لم يكن الأمر كذلك، فأين تعتقد أن دورك سيكون أنسب ولماذا؟', false,
    NULL, NULL,
    '{"variable_name":"preferred_dept_fit"}');

  PERFORM nq('radio',
    'Do you think your current department''s mandate is clear?',
    'هل تعتقد أن مهام قسمك الحالي واضحة؟', true,
    ARRAY['Yes','Partly','No'],
    ARRAY['نعم','إلى حد ما','لا'],
    '{"variable_name":"dept_mandate_clear"}');

  PERFORM nq('textarea',
    'What do you think is missing in your department right now?',
    'في اعتقادك ما الذي يفتقده قسمك الآن؟', false,
    NULL, NULL,
    '{"variable_name":"dept_gaps"}');

  PERFORM nq('textarea',
    'If your department were restructured, what should be kept, changed, merged, or strengthened?',
    'إذا تمت إعادة هيكلة قسمك، فما الذي ينبغي الإبقاء عليه، أو تغييره، أو دمجه، أو تعزيزه؟', false,
    NULL, NULL,
    '{"variable_name":"restructuring_recommendations"}');

  -- ─────────────────────────────────────────────────────────────────────
  -- SECTION 6: Capacity and Support Needs
  -- ─────────────────────────────────────────────────────────────────────
  PERFORM nq('section_header', 'Capacity and Support Needs',
    'رفع القدرات ودعم الاحتياجات');

  PERFORM nq('textarea',
    'What are the top 3 capacity gaps affecting your work?',
    'ما أهم ثلاث قدرات ترغب في تعزيزها وتؤثر مباشرة على عملك الحالي؟', true,
    NULL, NULL,
    '{"variable_name":"capacity_gaps"}');

  PERFORM nq('checkbox',
    'What support would help you perform better?',
    'ما نوع الدعم الذي من شأنه أن يساعدك على أداء عملك بصورة أفضل؟', false,
    ARRAY['Clearer role','More authority','More staff','Better systems / tools','Better coordination','More training','Better supervision','Other'],
    ARRAY['دور أكثر وضوحاً','صلاحيات أوسع','عدد أكبر من الموظفين','أنظمة / أدوات أفضل','تنسيق أفضل','مزيد من التدريب','إشراف أفضل','أخرى'],
    '{"variable_name":"support_needs"}');

  PERFORM nq('textarea',
    'If PACT could add one role or support function to improve your area, what would it be and why?',
    'إذا كان بإمكان باكت إضافة دور أو وظيفة مساندة واحدة لتحسين مجال عملك فماذا ستكون ولماذا؟', false,
    NULL, NULL,
    '{"variable_name":"one_role_addition"}');

  PERFORM nq('radio',
    'Are there tasks currently being done by one or two people that should be shared more widely?',
    'هل توجد مهام يُنفِّذها حالياً شخص أو شخصان فقط، وكان من الأفضل توزيعها على عدد أكبر من الموظفين؟', false,
    ARRAY['Yes','No'],
    ARRAY['نعم','لا'],
    '{"variable_name":"tasks_should_be_shared"}');

  PERFORM nq('textarea',
    'If yes, please explain.',
    'إذا كانت الإجابة نعم، يرجى التوضيح.', false,
    NULL, NULL,
    '{"variable_name":"shared_tasks_details"}');

  -- ─────────────────────────────────────────────────────────────────────
  -- SECTION 7: Project Work and Implementation Readiness
  -- ─────────────────────────────────────────────────────────────────────
  PERFORM nq('section_header', 'Project Work and Implementation Readiness',
    'التنفيذ والجاهزية للمشاريع');

  PERFORM nq('radio',
    'Are you involved in proposals, contracts, project implementation, reporting, or field operations?',
    'هل تشارك في إعداد المقترحات، أو العقود، أو تنفيذ المشاريع، أو التقارير، أو العمليات الميدانية؟', true,
    ARRAY['Yes','No'],
    ARRAY['نعم','لا'],
    '{"variable_name":"project_involvement"}');

  PERFORM nq('checkbox',
    'If yes, at which stage are you usually involved?',
    'إذا كانت الإجابة نعم، ففي أي مرحلة تشارك عادة؟', false,
    ARRAY['Opportunity identification','Proposal development','Contract review','Start-up / mobilization','Implementation','Reporting','Field Operations','Close-out / learning'],
    ARRAY['تحديد الفرصة','إعداد المقترحات','مراجعة العقود','البدء / التعبئة','التنفيذ','إعداد التقارير','العمليات الميدانية','الإغلاق / الدروس المستفادة'],
    '{"variable_name":"project_stages"}');

  PERFORM nq('checkbox',
    'In your view, where are the biggest project handoff gaps?',
    'من وجهة نظرك، أين توجد أكبر فجوات التسليم / نقل المسؤولية بين مراحل المشروع؟', false,
    ARRAY['Proposal to contract','Contract to start-up','Start-up to field implementation','Field to reporting','Between technical and support teams','Other'],
    ARRAY['من المقترح إلى إبرام العقد','من إبرام العقد إلى مرحلة الإطلاق','من مرحلة الإطلاق إلى التنفيذ الميداني','من المرحلة الميدانية إلى إعداد التقارير','بين الفرق الفنية وفرق الدعم','أخرى'],
    '{"variable_name":"handoff_gaps"}');

  PERFORM nq('textarea',
    'What would make project implementation smoother at PACT?',
    'ما الذي من شأنه أن يجعل تنفيذ المشاريع في باكت أكثر سلاسة؟', false,
    NULL, NULL,
    '{"variable_name":"project_improvement"}');

  -- ─────────────────────────────────────────────────────────────────────
  -- SECTION 8: Tools, Files, and Systems
  -- ─────────────────────────────────────────────────────────────────────
  PERFORM nq('section_header', 'Tools, Files, and Systems',
    'الأدوات والملفات والأنظمة');

  PERFORM nq('textarea',
    'What tools do you mainly use in your work?',
    'ما الأدوات التي تستخدمها بشكل أساسي في عملك؟', false,
    NULL, NULL,
    '{"variable_name":"tools_used"}');

  PERFORM nq('checkbox',
    'Where do you currently store or retrieve most of your work files?',
    'أين تحتفظ حالياً بمعظم ملفات عملك، أو من أين تسترجعها؟', false,
    ARRAY['Personal laptop','Email','WhatsApp','Shared drive','Cloud folder','System / platform','Other'],
    ARRAY['حاسوب / محمول شخصي','البريد الإلكتروني','واتساب','مساحة تخزين مشتركة','مجلد تخزين سحابي','نظام / منصة','أخرى'],
    '{"variable_name":"file_storage"}');

  PERFORM nq('radio',
    'Do you face file version-control or missing-document problems?',
    'هل تواجه مشكلات تتعلق بتعدد نسخ الملفات أو فقدان المستندات؟', false,
    ARRAY['Yes','Sometimes','No'],
    ARRAY['نعم','أحياناً','لا'],
    '{"variable_name":"file_version_issues"}');

  PERFORM nq('textarea',
    'What would improve document access, filing, and retrieval in your area?',
    'ما الذي من شأنه أن يحسن الوصول إلى المستندات وحفظها واسترجاعها في مجال عملك؟', false,
    NULL, NULL,
    '{"variable_name":"document_improvement"}');

  -- ─────────────────────────────────────────────────────────────────────
  -- SECTION 9: Suggestions for Restructuring
  -- ─────────────────────────────────────────────────────────────────────
  PERFORM nq('section_header', 'Suggestions for Restructuring',
    'مقترحات لإعادة الهيكلة');

  PERFORM nq('textarea',
    'What is working well in the current structure and should be preserved?',
    'ما هي الجوانب الإيجابية في الهيكل الحالي التي ينبغي الحفاظ عليها؟', false,
    NULL, NULL,
    '{"variable_name":"current_strengths"}');

  PERFORM nq('textarea',
    'What does not work well and should be changed?',
    'ما الذي لا يعمل بصورة جيدة ويجب تغييره؟', false,
    NULL, NULL,
    '{"variable_name":"current_weaknesses"}');

  PERFORM nq('textarea',
    'Which departments or functions need stronger coordination?',
    'ما هي الأقسام أو الوظائف التي تحتاج إلى تنسيق أقوى؟', false,
    NULL, NULL,
    '{"variable_name":"coordination_gaps"}');

  PERFORM nq('textarea',
    'Are there departments or functions that should be merged, separated, or strengthened? Please explain.',
    'هل هناك أقسام أو وظائف ينبغي دمجها أو فصلها أو تقويتها؟ يرجى التوضيح.', false,
    NULL, NULL,
    '{"variable_name":"dept_restructuring"}');

  PERFORM nq('textarea',
    'What is your single most important recommendation for improving PACT''s structure and effectiveness?',
    'ما هي أهم توصية تقدمها لتحسين هيكل باكت وفاعليته؟', false,
    NULL, NULL,
    '{"variable_name":"top_recommendation"}');

  -- ─────────────────────────────────────────────────────────────────────
  -- SECTION 10: Staff Perspective and Future Alignment
  -- ─────────────────────────────────────────────────────────────────────
  PERFORM nq('section_header', 'Staff Perspective and Future Alignment',
    'وجهة نظر الموظفين والتوافق المستقبلي');

  PERFORM nq('textarea',
    'In what kind of role do you think you can contribute most effectively within PACT?',
    'في أي نوع من الأدوار تعتقد أنك ستتمكن من تقديم أكبر مساهمة فعالة داخل باكت؟', false,
    NULL, NULL,
    '{"variable_name":"effective_role_preference"}');

  PERFORM nq('radio',
    'Are you open to reassignment or adjustment of responsibilities if needed for restructuring?',
    'هل أنت مستعد/ة لتغيير مهامك أو تعديل مسؤولياتك إذا دعت الحاجة إلى ذلك في إطار عملية إعادة الهيكلة؟', true,
    ARRAY['Yes','Partly / with conditions','No'],
    ARRAY['نعم','إلى حد ما / بشروط','لا'],
    '{"variable_name":"open_to_reassignment"}');

  PERFORM nq('textarea',
    'What strengths, qualifications, or experience should PACT consider when reviewing your placement?',
    'ما نقاط القوة أو المؤهلات أو الخبرات التي ينبغي لباكت أخذها في الاعتبار عند مراجعة تقييمك؟', false,
    NULL, NULL,
    '{"variable_name":"strengths_for_placement"}');

  PERFORM nq('textarea',
    'Is there anything else management should know when considering restructuring and staff deployment?',
    'هل هناك أي أمور أخرى ينبغي على الإدارة الإلمام بها عند النظر في إعادة الهيكلة وتوزيع الموظفين؟', false,
    NULL, NULL,
    '{"variable_name":"additional_notes"}');

  RAISE NOTICE 'Done. Inserted % questions for survey %.', v_idx, v_survey_id;
END $$;
