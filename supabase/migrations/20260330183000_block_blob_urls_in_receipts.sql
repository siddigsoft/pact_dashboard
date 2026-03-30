-- Prevent non-persistent local URLs from being stored in receipts/supporting docs.
-- This protects mobile/web rendering from broken blob:/file: references.

-- 1) Helper: detect invalid urls inside supporting_documents JSONB array.
create or replace function public.has_invalid_supporting_document_urls(docs jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when docs is null or jsonb_typeof(docs) <> 'array' then false
    else exists (
      select 1
      from jsonb_array_elements(docs) as elem
      where coalesce(lower(trim(elem->>'url')), '') like 'blob:%'
         or coalesce(lower(trim(elem->>'url')), '') like 'file:%'
    )
  end;
$$;

-- 2) Cleanup existing problematic rows.
update public.operational_cost_submissions
set payment_proof_url = null
where payment_proof_url is not null
  and (
    lower(trim(payment_proof_url)) like 'blob:%'
    or lower(trim(payment_proof_url)) like 'file:%'
    or trim(payment_proof_url) = ''
  );

update public.operational_cost_submissions
set supporting_documents = coalesce(
  (
    select jsonb_agg(elem)
    from jsonb_array_elements(supporting_documents) as elem
    where not (
      coalesce(lower(trim(elem->>'url')), '') like 'blob:%'
      or coalesce(lower(trim(elem->>'url')), '') like 'file:%'
      or trim(coalesce(elem->>'url', '')) = ''
    )
  ),
  '[]'::jsonb
)
where supporting_documents is not null
  and public.has_invalid_supporting_document_urls(supporting_documents);

-- 3) Enforce constraints for future writes.
alter table public.operational_cost_submissions
  drop constraint if exists ocs_payment_proof_url_not_local;

alter table public.operational_cost_submissions
  add constraint ocs_payment_proof_url_not_local
  check (
    payment_proof_url is null
    or (
      lower(trim(payment_proof_url)) not like 'blob:%'
      and lower(trim(payment_proof_url)) not like 'file:%'
      and trim(payment_proof_url) <> ''
    )
  );

alter table public.operational_cost_submissions
  drop constraint if exists ocs_supporting_documents_urls_not_local;

alter table public.operational_cost_submissions
  add constraint ocs_supporting_documents_urls_not_local
  check (not public.has_invalid_supporting_document_urls(supporting_documents));
