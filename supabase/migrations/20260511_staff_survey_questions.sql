-- =============================================================================
-- Populate all questions for the Staff Restructuring Survey (short_code = kcsebnqb)
-- Run once in Supabase SQL editor.
-- WARNING: Deletes existing questions for this survey then re-creates them.
-- =============================================================================

DO $$
DECLARE
  sid uuid;
BEGIN
  SELECT id INTO sid FROM surveys WHERE short_code = 'kcsebnqb';
  IF sid IS NULL THEN
    RAISE EXCEPTION 'Survey with short_code "kcsebnqb" not found.';
  END IF;

  DELETE FROM survey_questions WHERE survey_id = sid;

  -- ── Section 1: Staff Profile ──────────────────────────────────────────
  INSERT INTO survey_questions (id,survey_id,type,label,label_ar,required,options,options_ar,settings,order_index,group_id) VALUES
  (gen_random_uuid(),sid,'section_header','Staff Profile','بيانات الموظف',false,NULL,NULL,'{}',1,NULL),
  (gen_random_uuid(),sid,'text','Full name','الاسم الكامل',true,NULL,NULL,'{"variable_name":"full_name"}',2,NULL),
  (gen_random_uuid(),sid,'text','Current title / role','المسمى الوظيفي / الدور الحالي',true,NULL,NULL,'{"variable_name":"current_title"}',3,NULL),
  (gen_random_uuid(),sid,'text','Department / function currently assigned to','الإدارة / القسم الذي تتبع له حالياً',true,NULL,NULL,'{"variable_name":"department"}',4,NULL),
  (gen_random_uuid(),sid,'text','Country / duty location','البلد / موقع العمل',true,NULL,NULL,'{"variable_name":"country"}',5,NULL),
  (gen_random_uuid(),sid,'dropdown','Contract type','نوع التعاقد',true,
    '["Full-time","Part-time","Retainer / consultant","Volunteer","Other"]'::jsonb,
    '["دوام كامل","دوام جزئي","متعاقد / مستشار","متطوع","أخرى"]'::jsonb,
    '{"variable_name":"contract_type"}',6,NULL),
  (gen_random_uuid(),sid,'text','If other, please specify','إذا كانت "أخرى"، يرجى التحديد',false,NULL,NULL,'{"variable_name":"contract_type_other"}',7,NULL),
  (gen_random_uuid(),sid,'text','Reports to (current Line Manager)','من هو مديرك المباشر الحالي',true,NULL,NULL,'{"variable_name":"reports_to"}',8,NULL),
  (gen_random_uuid(),sid,'text','If applicable, who reports to you?','من هم الأشخاص الذين يعملون تحت إشرافك؟',false,NULL,NULL,'{"variable_name":"reports_to_me"}',9,NULL),
  (gen_random_uuid(),sid,'text','How long have you been working with PACT?','منذ متى وأنت تعمل مع باكت؟',true,NULL,NULL,'{"variable_name":"tenure_pact"}',10,NULL);

  -- ── Section 2: Understanding of Current Role ──────────────────────────
  INSERT INTO survey_questions (id,survey_id,type,label,label_ar,required,options,options_ar,settings,order_index,group_id) VALUES
  (gen_random_uuid(),sid,'section_header','Understanding of Current Role','فهم الدور الحالي',false,NULL,NULL,'{}',11,NULL),
  (gen_random_uuid(),sid,'textarea','In your own words, what is your current role at PACT?','من منظورك الشخصي، ما هو دورك الحالي في باكت؟',true,NULL,NULL,'{"variable_name":"current_role_description"}',12,NULL),
  (gen_random_uuid(),sid,'radio','Do you feel your current role is clearly defined?','هل ترى أن مهامك الوظيفية محددة بوضوح؟',true,
    '["Yes","Partly","No"]'::jsonb,'["نعم","إلى حد ما","لا"]'::jsonb,
    '{"variable_name":"role_clearly_defined"}',13,NULL),
  (gen_random_uuid(),sid,'textarea','If Partly or No, what is unclear?','إذا كانت الإجابة "إلى حد ما" أو "لا"، فما الجوانب التي ما زالت غير واضحة؟',false,NULL,NULL,'{"variable_name":"role_unclear_details"}',14,NULL),
  (gen_random_uuid(),sid,'radio','Do you have a written ToR / JD / Assignment for your role?','هل لديك عقد كتابي أو وصف وظيفي يحدد نطاق عملك؟',true,
    '["Yes","No"]'::jsonb,'["نعم","لا"]'::jsonb,
    '{"variable_name":"has_written_tor"}',15,NULL),
  (gen_random_uuid(),sid,'radio','Does your day-to-day work match your formal role?','هل يتوافق عملك اليومي مع مهام وظيفتك الحالية؟',true,
    '["Yes","Partly","No"]'::jsonb,'["نعم","إلى حد ما","لا"]'::jsonb,
    '{"variable_name":"work_matches_role"}',16,NULL),
  (gen_random_uuid(),sid,'textarea','If No or Partly, what is different in practice?','إذا كانت الإجابة "لا" أو "إلى حد ما"، فما الفرق في الواقع؟',false,NULL,NULL,'{"variable_name":"work_mismatch_details"}',17,NULL);

  -- ── Section 3: Current Work and Recent Contribution ───────────────────
  INSERT INTO survey_questions (id,survey_id,type,label,label_ar,required,options,options_ar,settings,order_index,group_id) VALUES
  (gen_random_uuid(),sid,'section_header','Current Work and Recent Contribution','المهام الحالية والمساهمات الأخيرة',false,NULL,NULL,'{}',18,NULL),
  (gen_random_uuid(),sid,'textarea','What are your top 5 current responsibilities?','ما هي أهم 5 مسؤوليات تتولى القيام بها حالياً؟',true,NULL,NULL,'{"variable_name":"top_responsibilities"}',19,NULL),
  (gen_random_uuid(),sid,'textarea','What work are you mainly doing now in practice?','ما هي المهام التي تقوم بها بشكل أساسي في منصبك الحالي؟',true,NULL,NULL,'{"variable_name":"current_work_in_practice"}',20,NULL);

  INSERT INTO survey_questions (id,survey_id,type,label,label_ar,required,options,options_ar,settings,order_index,group_id) VALUES
  (gen_random_uuid(),sid,'grid_table',
    'What have you completed or contributed to in the last 30 days?',
    'ما الذي أنجزته أو ساهمت فيه خلال الثلاثين يوماً الماضية؟',
    false,NULL,NULL,
    '{"variable_name":"last_30_days","grid_columns":[{"id":"priority","label":"Priority","type":"text"},{"id":"project","label":"Project / Initiative","type":"text"},{"id":"task","label":"Task / Activity","type":"text"},{"id":"start_date","label":"Start Date","type":"date"},{"id":"end_date","label":"End Date","type":"date"},{"id":"duration","label":"Time / Effort","type":"text"},{"id":"role","label":"Your Role","type":"text"},{"id":"outcome","label":"Outcome / Deliverable","type":"text"},{"id":"comments","label":"Comments","type":"text"}],"min_rows":1,"max_rows":10}',
    21,NULL),
  (gen_random_uuid(),sid,'grid_table',
    'What are you planning or expected to work on in the next 30 days?',
    'ما الذي تخطط للعمل عليه أو يُتوقع منك العمل عليه خلال الثلاثين يوماً القادمة؟',
    false,NULL,NULL,
    '{"variable_name":"next_30_days","grid_columns":[{"id":"priority","label":"Priority","type":"text"},{"id":"project","label":"Project / Initiative","type":"text"},{"id":"task","label":"Planned Task / Activity","type":"text"},{"id":"start_date","label":"Planned Start","type":"date"},{"id":"end_date","label":"Planned End","type":"date"},{"id":"duration","label":"Estimated Effort","type":"text"},{"id":"role","label":"Your Role","type":"text"},{"id":"outcome","label":"Expected Outcome","type":"text"},{"id":"dependencies","label":"Dependencies","type":"text"},{"id":"comments","label":"Comments","type":"text"}],"min_rows":1,"max_rows":10}',
    22,NULL);

  INSERT INTO survey_questions (id,survey_id,type,label,label_ar,required,options,options_ar,settings,order_index,group_id) VALUES
  (gen_random_uuid(),sid,'textarea','Which of your current tasks add the most value to PACT?','أي من مهامك الحالية يحقق أكبر قيمة مضافة لباكت؟',false,NULL,NULL,'{"variable_name":"high_value_tasks"}',23,NULL),
  (gen_random_uuid(),sid,'textarea','Which of your current tasks could be reassigned, simplified, or stopped?','أي من مهامك الحالية يمكن إعادة إسناده أو تبسيطه أو إلغاؤه؟',false,NULL,NULL,'{"variable_name":"tasks_to_reassign"}',24,NULL);

  -- ── Section 4: Reporting, Approvals, and Coordination ─────────────────
  INSERT INTO survey_questions (id,survey_id,type,label,label_ar,required,options,options_ar,settings,order_index,group_id) VALUES
  (gen_random_uuid(),sid,'section_header','Reporting, Approvals, and Coordination','الإشراف والموافقات والتنسيق',false,NULL,NULL,'{}',25,NULL),
  (gen_random_uuid(),sid,'radio',
    'Do you clearly know who you report to, who approves of your work, and who you coordinate with most often?',
    'هل تعرف بوضوح من ترفع إليه تقاريرك، ومن يعتمد عملك، ومع من تنسق بصورة متكررة؟',
    true,'["Yes","Partly","No"]'::jsonb,'["نعم","إلى حد ما","لا"]'::jsonb,
    '{"variable_name":"know_reporting_lines"}',26,NULL),
  (gen_random_uuid(),sid,'textarea','What approvals do you regularly need to perform your work?','ما أنواع الموافقات التي تحتاج إليها بصورة منتظمة لتنفيذ عملك؟',false,NULL,NULL,'{"variable_name":"regular_approvals"}',27,NULL),
  (gen_random_uuid(),sid,'textarea','If there are approval delays, where do they most often happen?','إذا كان هناك تأخير في الموافقات، فأين يحدث غالباً؟',false,NULL,NULL,'{"variable_name":"approval_delays"}',28,NULL),
  (gen_random_uuid(),sid,'textarea','Which departments / people do you rely on most to complete your work?','ما الأقسام أو الأشخاص الذين تعتمد عليهم أكثر من غيرهم لإنجاز عملك؟',false,NULL,NULL,'{"variable_name":"key_dependencies"}',29,NULL),
  (gen_random_uuid(),sid,'checkbox','What usually slows work down in your area?','ما الذي يبطئ العمل غالباً في مجالك؟',false,
    '["Waiting for approval","Waiting for input","Unclear responsibilities","Staff capacity","Delayed communication","Systems / tools","Other"]'::jsonb,
    '["انتظار الموافقة","انتظار المدخلات","عدم وضوح المسؤوليات","ضعف قدرات الموظفين","ضعف التواصل","الأنظمة / الأدوات","أخرى"]'::jsonb,
    '{"variable_name":"work_slowdowns"}',30,NULL),
  (gen_random_uuid(),sid,'radio','Do you think information is shared clearly enough across departments?','هل ترى أن المعلومات تُشارك بوضوح كافٍ بين الأقسام؟',true,
    '["Yes","Partly","No"]'::jsonb,'["نعم","إلى حد ما","لا"]'::jsonb,
    '{"variable_name":"info_sharing_clarity"}',31,NULL),
  (gen_random_uuid(),sid,'checkbox','What kind of regular coordination would help most?','ما نوع التنسيق الدوري الذي من شأنه أن يساعد أكثر؟',false,
    '["More regular department meetings","More regular heads of department meetings","Better action tracking","Clearer escalation path","Better reporting","Other"]'::jsonb,
    '["اجتماعات أكثر انتظاماً على مستوى الأقسام","اجتماعات أكثر انتظاماً لرؤساء الأقسام","تحسين متابعة الإجراءات","مسار تصعيد أكثر وضوحاً","تحسين آلية رفع التقارير","أخرى"]'::jsonb,
    '{"variable_name":"coordination_needs"}',32,NULL);

  -- ── Section 5: Role Fit and Department Alignment ──────────────────────
  INSERT INTO survey_questions (id,survey_id,type,label,label_ar,required,options,options_ar,settings,order_index,group_id) VALUES
  (gen_random_uuid(),sid,'section_header','Role Fit and Department Alignment','ملاءمة الوظيفة وتوافق التخصص مع القسم',false,NULL,NULL,'{}',33,NULL),
  (gen_random_uuid(),sid,'radio','Do you think your current department''s placement is the right one?','هل ترى أنك حالياً تعمل في القسم أو المكان المناسب؟',true,
    '["Yes","No"]'::jsonb,'["نعم","لا"]'::jsonb,
    '{"variable_name":"dept_placement_right"}',34,NULL),
  (gen_random_uuid(),sid,'textarea','If not, where do you think your role would fit better, and why?','إذا لم يكن الأمر كذلك، فأين تعتقد أن دورك سيكون أنسب ولماذا؟',false,NULL,NULL,'{"variable_name":"preferred_dept_fit"}',35,NULL),
  (gen_random_uuid(),sid,'radio','Do you think your current department''s mandate is clear?','هل تعتقد أن مهام قسمك الحالي واضحة؟',true,
    '["Yes","Partly","No"]'::jsonb,'["نعم","إلى حد ما","لا"]'::jsonb,
    '{"variable_name":"dept_mandate_clear"}',36,NULL),
  (gen_random_uuid(),sid,'textarea','What do you think is missing in your department right now?','في اعتقادك ما الذي يفتقده قسمك الآن؟',false,NULL,NULL,'{"variable_name":"dept_gaps"}',37,NULL),
  (gen_random_uuid(),sid,'textarea','If your department were restructured, what should be kept, changed, merged, or strengthened?','إذا تمت إعادة هيكلة قسمك، فما الذي ينبغي الإبقاء عليه، أو تغييره، أو دمجه، أو تعزيزه؟',false,NULL,NULL,'{"variable_name":"restructuring_recommendations"}',38,NULL);

  -- ── Section 6: Capacity and Support Needs ────────────────────────────
  INSERT INTO survey_questions (id,survey_id,type,label,label_ar,required,options,options_ar,settings,order_index,group_id) VALUES
  (gen_random_uuid(),sid,'section_header','Capacity and Support Needs','رفع القدرات ودعم الاحتياجات',false,NULL,NULL,'{}',39,NULL),
  (gen_random_uuid(),sid,'textarea','What are the top 3 capacity gaps affecting your work?','ما أهم ثلاث قدرات ترغب في تعزيزها وتؤثر مباشرة على عملك الحالي؟',true,NULL,NULL,'{"variable_name":"capacity_gaps"}',40,NULL),
  (gen_random_uuid(),sid,'checkbox','What support would help you perform better?','ما نوع الدعم الذي من شأنه أن يساعدك على أداء عملك بصورة أفضل؟',false,
    '["Clearer role","More authority","More staff","Better systems / tools","Better coordination","More training","Better supervision","Other"]'::jsonb,
    '["دور أكثر وضوحاً","صلاحيات أوسع","عدد أكبر من الموظفين","أنظمة / أدوات أفضل","تنسيق أفضل","مزيد من التدريب","إشراف أفضل","أخرى"]'::jsonb,
    '{"variable_name":"support_needs"}',41,NULL),
  (gen_random_uuid(),sid,'textarea','If PACT could add one role or support function to improve your area, what would it be and why?','إذا كان بإمكان باكت إضافة دور أو وظيفة مساندة واحدة لتحسين مجال عملك فماذا ستكون ولماذا؟',false,NULL,NULL,'{"variable_name":"one_role_addition"}',42,NULL),
  (gen_random_uuid(),sid,'radio','Are there tasks currently being done by one or two people that should be shared more widely?','هل توجد مهام يُنفِّذها حالياً شخص أو شخصان فقط، وكان من الأفضل توزيعها على عدد أكبر من الموظفين؟',false,
    '["Yes","No"]'::jsonb,'["نعم","لا"]'::jsonb,
    '{"variable_name":"tasks_should_be_shared"}',43,NULL),
  (gen_random_uuid(),sid,'textarea','If yes, please explain.','إذا كانت الإجابة نعم، يرجى التوضيح.',false,NULL,NULL,'{"variable_name":"shared_tasks_details"}',44,NULL);

  -- ── Section 7: Project Work and Implementation Readiness ──────────────
  INSERT INTO survey_questions (id,survey_id,type,label,label_ar,required,options,options_ar,settings,order_index,group_id) VALUES
  (gen_random_uuid(),sid,'section_header','Project Work and Implementation Readiness','التنفيذ والجاهزية للمشاريع',false,NULL,NULL,'{}',45,NULL),
  (gen_random_uuid(),sid,'radio','Are you involved in proposals, contracts, project implementation, reporting, or field operations?','هل تشارك في إعداد المقترحات، أو العقود، أو تنفيذ المشاريع، أو التقارير، أو العمليات الميدانية؟',true,
    '["Yes","No"]'::jsonb,'["نعم","لا"]'::jsonb,
    '{"variable_name":"project_involvement"}',46,NULL),
  (gen_random_uuid(),sid,'checkbox','If yes, at which stage are you usually involved?','إذا كانت الإجابة نعم، ففي أي مرحلة تشارك عادة؟',false,
    '["Opportunity identification","Proposal development","Contract review","Start-up / mobilization","Implementation","Reporting","Field Operations","Close-out / learning"]'::jsonb,
    '["تحديد الفرصة","إعداد المقترحات","مراجعة العقود","البدء / التعبئة","التنفيذ","إعداد التقارير","العمليات الميدانية","الإغلاق / الدروس المستفادة"]'::jsonb,
    '{"variable_name":"project_stages"}',47,NULL),
  (gen_random_uuid(),sid,'checkbox','In your view, where are the biggest project handoff gaps?','من وجهة نظرك، أين توجد أكبر فجوات التسليم بين مراحل المشروع؟',false,
    '["Proposal to contract","Contract to start-up","Start-up to field implementation","Field to reporting","Between technical and support teams","Other"]'::jsonb,
    '["من المقترح إلى إبرام العقد","من إبرام العقد إلى مرحلة الإطلاق","من مرحلة الإطلاق إلى التنفيذ الميداني","من المرحلة الميدانية إلى إعداد التقارير","بين الفرق الفنية وفرق الدعم","أخرى"]'::jsonb,
    '{"variable_name":"handoff_gaps"}',48,NULL),
  (gen_random_uuid(),sid,'textarea','What would make project implementation smoother at PACT?','ما الذي من شأنه أن يجعل تنفيذ المشاريع في باكت أكثر سلاسة؟',false,NULL,NULL,'{"variable_name":"project_improvement"}',49,NULL);

  -- ── Section 8: Tools, Files, and Systems ─────────────────────────────
  INSERT INTO survey_questions (id,survey_id,type,label,label_ar,required,options,options_ar,settings,order_index,group_id) VALUES
  (gen_random_uuid(),sid,'section_header','Tools, Files, and Systems','الأدوات والملفات والأنظمة',false,NULL,NULL,'{}',50,NULL),
  (gen_random_uuid(),sid,'textarea','What tools do you mainly use in your work?','ما الأدوات التي تستخدمها بشكل أساسي في عملك؟',false,NULL,NULL,'{"variable_name":"tools_used"}',51,NULL),
  (gen_random_uuid(),sid,'checkbox','Where do you currently store or retrieve most of your work files?','أين تحتفظ حالياً بمعظم ملفات عملك، أو من أين تسترجعها؟',false,
    '["Personal laptop","Email","WhatsApp","Shared drive","Cloud folder","System / platform","Other"]'::jsonb,
    '["حاسوب / محمول شخصي","البريد الإلكتروني","واتساب","مساحة تخزين مشتركة","مجلد تخزين سحابي","نظام / منصة","أخرى"]'::jsonb,
    '{"variable_name":"file_storage"}',52,NULL),
  (gen_random_uuid(),sid,'radio','Do you face file version-control or missing-document problems?','هل تواجه مشكلات تتعلق بتعدد نسخ الملفات أو فقدان المستندات؟',false,
    '["Yes","Sometimes","No"]'::jsonb,'["نعم","أحياناً","لا"]'::jsonb,
    '{"variable_name":"file_version_issues"}',53,NULL),
  (gen_random_uuid(),sid,'textarea','What would improve document access, filing, and retrieval in your area?','ما الذي من شأنه أن يحسن الوصول إلى المستندات وحفظها واسترجاعها في مجال عملك؟',false,NULL,NULL,'{"variable_name":"document_improvement"}',54,NULL);

  -- ── Section 9: Suggestions for Restructuring ─────────────────────────
  INSERT INTO survey_questions (id,survey_id,type,label,label_ar,required,options,options_ar,settings,order_index,group_id) VALUES
  (gen_random_uuid(),sid,'section_header','Suggestions for Restructuring','مقترحات لإعادة الهيكلة',false,NULL,NULL,'{}',55,NULL),
  (gen_random_uuid(),sid,'textarea','What is working well in the current structure and should be preserved?','ما هي الجوانب الإيجابية في الهيكل الحالي التي ينبغي الحفاظ عليها؟',false,NULL,NULL,'{"variable_name":"current_strengths"}',56,NULL),
  (gen_random_uuid(),sid,'textarea','What does not work well and should be changed?','ما الذي لا يعمل بصورة جيدة ويجب تغييره؟',false,NULL,NULL,'{"variable_name":"current_weaknesses"}',57,NULL),
  (gen_random_uuid(),sid,'textarea','Which departments or functions need stronger coordination?','ما هي الأقسام أو الوظائف التي تحتاج إلى تنسيق أقوى؟',false,NULL,NULL,'{"variable_name":"coordination_gaps"}',58,NULL),
  (gen_random_uuid(),sid,'textarea','Are there departments or functions that should be merged, separated, or strengthened? Please explain.','هل هناك أقسام أو وظائف ينبغي دمجها أو فصلها أو تقويتها؟ يرجى التوضيح.',false,NULL,NULL,'{"variable_name":"dept_restructuring"}',59,NULL),
  (gen_random_uuid(),sid,'textarea','What is your single most important recommendation for improving PACT''s structure and effectiveness?','ما هي أهم توصية تقدمها لتحسين هيكل باكت وفاعليته؟',false,NULL,NULL,'{"variable_name":"top_recommendation"}',60,NULL);

  -- ── Section 10: Staff Perspective and Future Alignment ────────────────
  INSERT INTO survey_questions (id,survey_id,type,label,label_ar,required,options,options_ar,settings,order_index,group_id) VALUES
  (gen_random_uuid(),sid,'section_header','Staff Perspective and Future Alignment','وجهة نظر الموظفين والتوافق المستقبلي',false,NULL,NULL,'{}',61,NULL),
  (gen_random_uuid(),sid,'textarea','In what kind of role do you think you can contribute most effectively within PACT?','في أي نوع من الأدوار تعتقد أنك ستتمكن من تقديم أكبر مساهمة فعالة داخل باكت؟',false,NULL,NULL,'{"variable_name":"effective_role_preference"}',62,NULL),
  (gen_random_uuid(),sid,'radio','Are you open to reassignment or adjustment of responsibilities if needed for restructuring?','هل أنت مستعد/ة لتغيير مهامك أو تعديل مسؤولياتك إذا دعت الحاجة إلى ذلك في إطار عملية إعادة الهيكلة؟',true,
    '["Yes","Partly / with conditions","No"]'::jsonb,
    '["نعم","إلى حد ما / بشروط","لا"]'::jsonb,
    '{"variable_name":"open_to_reassignment"}',63,NULL),
  (gen_random_uuid(),sid,'textarea','What strengths, qualifications, or experience should PACT consider when reviewing your placement?','ما نقاط القوة أو المؤهلات أو الخبرات التي ينبغي لباكت أخذها في الاعتبار عند مراجعة تقييمك؟',false,NULL,NULL,'{"variable_name":"strengths_for_placement"}',64,NULL),
  (gen_random_uuid(),sid,'textarea','Is there anything else management should know when considering restructuring and staff deployment?','هل هناك أي أمور أخرى ينبغي على الإدارة الإلمام بها عند النظر في إعادة الهيكلة وتوزيع الموظفين؟',false,NULL,NULL,'{"variable_name":"additional_notes"}',65,NULL);

  RAISE NOTICE 'Done — inserted 65 questions for survey %', sid;
END $$;
