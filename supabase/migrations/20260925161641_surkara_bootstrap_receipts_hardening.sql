create index if not exists organization_bootstrap_receipts_org_fk_idx
  on public.organization_bootstrap_receipts(organization_id);

create policy bootstrap_receipts_deny_authenticated
on public.organization_bootstrap_receipts
for all
to authenticated
using (false)
with check (false);
