# Project Documents → Workspace Mirror

## Goal
When a user uploads a document on a project page, also place it in Workspace Hub under:

`Projects / {Project Name} / {Uploader Full Name} / {file}`

## Behavior
1. Existing upload still writes to `mmp-files` + `project_documents` (source of truth on the project page).
2. After success, mirror into Workspace (non-fatal):
   - Ensure root folder `Projects`
   - Ensure `{project.name}` under `Projects`
   - Ensure `{uploader full_name}` under the project folder
   - Upload bytes to `workspace-files` bucket
   - Insert/upsert `workspace_files` row in that uploader folder
3. Deleting from the project panel does **not** delete the Workspace copy (v1).

## Out of scope
- Renaming project folders when the project is renamed
- Backfilling existing `project_documents` into Workspace
