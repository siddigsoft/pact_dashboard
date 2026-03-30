-- ============================================================
-- FIX: Remove 73 South Darfur entries from the Blue Nile coordinator
--
-- PROBLEM: The original restore script incorrectly assigned 73 South Darfur
-- "Pending" site entries to the Blue Nile coordinator (ee667ad1).
-- These entries belonged to coordinator 633d0cb0 (South Darfur), whose
-- account has since been deleted from the profiles table.
--
-- WHAT THIS DOES:
--   1. Clears forwarded_to_user_id for the 73 South Darfur entries
--      (unassigns them from the Blue Nile coordinator)
--   2. Sets status back to 'Pending' so they are available for re-assignment
--      to an active South Darfur coordinator
--
-- AFFECTED:
--   MMP:              1e1909b4-1d70-4b90-898a-97c496d2c888
--   Blue Nile coord:  ee667ad1-dee7-4901-a53b-20cfbb7b35d6  (was WRONG owner)
--   Entry count:      73  (all state = 'South Darfur', status was 'Pending')
--
-- AFTER RUNNING: Re-assign these 73 sites to a South Darfur coordinator via
-- the Review & Assign Coordinators page in the app.
-- Active South Darfur coordinators:
--   1e96f1a7  Yassen Adam gedo
--   c7f16620  ياسر إبراهيم عمر جبريل
-- ============================================================

BEGIN;

-- Step 1: Unassign the 73 South Darfur entries from the Blue Nile coordinator
UPDATE mmp_site_entries
SET
  forwarded_to_user_id = NULL,
  status               = 'Pending',
  updated_at           = NOW()
WHERE id IN (
  '2615773c-807e-4e18-bc46-d32ff668513e',
  '60e86cd1-1eff-4397-b3ed-f7b6b41ed5bc',
  '537c054c-ee50-40ae-95c6-f8b53dd4c3dc',
  'cb0ce549-4ef5-485d-8f1f-dca61578aaf9',
  'd86fd795-3974-4b2d-9b6b-3b89127689be',
  'ec7a101e-43a9-4521-a26b-cbf6587aead1',
  '9c0f4826-9b6d-4710-acc8-7be188abf6eb',
  'c50b3ec8-30e8-4a04-be63-1d468d0ccf83',
  '052f9336-5411-4392-bdcd-f9a06c544417',
  '9e691c5d-afd0-4979-9f0e-e0daad899ee7',
  '3104b09d-3c1c-47ff-ba12-6f88ebaa1753',
  '6d9b1152-f89b-4994-bc07-0b4aa3b74699',
  '404a6c1d-85c5-4051-bddb-c05b7474ffe9',
  '5b4da112-1e11-4966-a27d-df9eff911152',
  '80d80bd2-0033-4d41-b59e-81bc4f55db40',
  'a7481f49-2b31-4f41-986c-11c7faa8d66e',
  '418d6a75-fb75-457e-b812-5144cbf5f633',
  '1097b966-8741-4caf-aa78-6b825d6ebd7d',
  '8632a95e-b993-420a-a39d-c98eccf4bf10',
  'fc24afab-e891-4cd8-9993-d87fb27d8e20',
  'b09e45b8-55f7-4b2c-9530-b95ff77b8ea3',
  'e612fe82-c83e-4dd2-b689-ed62074172bf',
  '0bf55c09-d570-4372-bde1-81a214e60b48',
  '57fb7cb5-f1a6-475b-bc68-f5f587d940dc',
  'fc0071c3-dfa6-4544-b629-b55ef59cf949',
  '064b2b2c-9f3e-44bc-a03d-9a8958628317',
  '35fb9c14-6dd5-4e02-bdad-efe4eb6d1ec6',
  'ab8d4646-2656-42a5-aa2c-3cd9de1b7098',
  '9d55f48d-2930-499d-9835-4193a006d1af',
  '2b4bc48b-a049-4e71-8c06-8652720f007f',
  'e261c0f2-0726-4282-887c-606bd00be280',
  '2489f2bd-2803-4a15-8537-91cb445ab8e5',
  'f8264b06-a121-46c0-8b5c-164f4673b997',
  'e795e83a-4cfc-4b19-9445-bcd7624cdbcf',
  '547dd0ee-9709-4ca4-8ace-28a0398606a2',
  '0e96fade-8b40-4351-a908-a6e84f205bc7',
  '73ba79c2-0498-4cd4-b6b2-b518dc3a82b7',
  '169a4b61-d209-449f-8b71-91a29bcf1909',
  '5a20f998-5093-42c7-b753-1f4b6112a982',
  'd0788a94-9db8-4055-a3c5-7ad0632b82df',
  '149469db-5a38-4e7d-ae96-d15caeea1e3f',
  'c6ff9d6d-50bb-40e6-8e68-5192f7364dd0',
  '4d6befe6-cd69-4242-aa93-c7c6c0daad3b',
  '5c26aab4-aa20-4fdf-b06b-54a419a383b7',
  '4495c351-bba3-4c52-aae6-64f9d5c2afd6',
  '84025fbd-f8ad-472a-a48a-42348632d854',
  '3e0ddbaa-cd19-4aaf-b817-c44eb1ab089b',
  '78a39ebb-f51a-4223-81b6-d9c7300f9d7b',
  'c6a0c2c1-23a4-4cb7-b862-f31ee742cf50',
  '78a6f5da-5395-46f1-a684-555d7bd6f39f',
  'ef300aaa-6823-4bc7-849c-b009e58d4ebb',
  '199a5dcd-68ee-42d9-b0d2-817a3898df33',
  '05860350-62e0-46cc-bb06-a32d0384b8ab',
  '40195695-9ceb-4fd2-8590-d2b221918dd4',
  '306c4825-336d-4359-a09b-7ec43a6fb4b5',
  'ff6b6f3c-173e-4d44-a43f-c7ae3ff87e47',
  'b3fcb46d-87e2-4c36-a23f-eee6e8e34b2d',
  'ac56e49b-561e-471e-96b6-35f088577021',
  '9cf4db0e-d4e9-4886-b790-765ba51ec394',
  'b497bd50-0ff4-4a43-b33f-d27c1a3071d9',
  'bbb7be11-5fee-46f4-8158-8d99d62fff4e',
  '3aa6c565-0efd-4044-bc2d-5d559964d6b4',
  'f81de3e4-c4d9-4e94-8ec4-749fa3e893bb',
  'c3a6f68e-078c-4874-b530-17c5af57544f',
  '1dbf9fd6-25f1-4f95-98c2-15349d0d0b57',
  'ad885279-0672-48d7-9cab-800596118332',
  'a443ae63-4728-4591-9d4f-932c2860411a',
  'e650b017-872b-4e6e-b87b-9c4e23d97f08',
  '5f2d97bb-606c-411d-bd6c-ba92021b6eb0',
  '3aa038f1-e2cf-45fb-805e-e5c7980ab56c',
  '9f8c8ef8-d067-4bb6-9eb8-4cf112dfe63d',
  'ea19020f-4c77-423f-9355-e0caa73fa0ca',
  '81bf56fd-feba-4ede-9a43-3181a9f5118f'
);

-- Step 2: Verify the fix
DO $$
DECLARE
  blue_nile_sd_count INT;
  unassigned_pending INT;
BEGIN
  SELECT COUNT(*) INTO blue_nile_sd_count
  FROM mmp_site_entries
  WHERE forwarded_to_user_id = 'ee667ad1-dee7-4901-a53b-20cfbb7b35d6'
    AND state = 'South Darfur';

  SELECT COUNT(*) INTO unassigned_pending
  FROM mmp_site_entries
  WHERE forwarded_to_user_id IS NULL
    AND status = 'Pending'
    AND state  = 'South Darfur'
    AND mmp_file_id = '1e1909b4-1d70-4b90-898a-97c496d2c888';

  RAISE NOTICE 'Blue Nile coordinator South Darfur entries remaining: % (should be 0)', blue_nile_sd_count;
  RAISE NOTICE 'Unassigned South Darfur Pending entries: % (should be 73)', unassigned_pending;
END $$;

COMMIT;
