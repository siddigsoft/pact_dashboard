-- Add cost_acknowledged column to mmp_site_entries
alter table public.mmp_site_entries 
add column if not exists cost_acknowledged boolean default false,
add column if not exists cost_acknowledged_at timestamp with time zone,
add column if not exists cost_acknowledged_by uuid references public.profiles(id);

-- Create an index for better query performance
create index if not exists idx_mmp_site_entries_cost_acknowledged 
on public.mmp_site_entries (cost_acknowledged)
where cost_acknowledged = true;

-- Add comment for documentation
comment on column public.mmp_site_entries.cost_acknowledged is 'Indicates if the cost has been acknowledged by the relevant party';
comment on column public.mmp_site_entries.cost_acknowledged_at is 'Timestamp when the cost was acknowledged';
comment on column public.mmp_site_entries.cost_acknowledged_by is 'User who acknowledged the cost';

-- Update the updated_at column when cost_acknowledged changes
create or replace function public.handle_mmp_site_entries_cost_acknowledged()
returns trigger as $$
begin
    if new.cost_acknowledged is distinct from old.cost_acknowledged then
        new.updated_at = now();
    end if;
    return new;
end;
$$ language plpgsql security definer;

-- Create trigger for the function
create or replace trigger on_mmp_site_entries_cost_acknowledged
before update of cost_acknowledged on public.mmp_site_entries
for each row
execute function public.handle_mmp_site_entries_cost_acknowledged();
