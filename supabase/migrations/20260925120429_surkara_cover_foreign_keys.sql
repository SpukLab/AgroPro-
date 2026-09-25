create index if not exists agricultural_operations_campaign_tenant_fk_idx
  on public.agricultural_operations(campaign_id, organization_id);
create index if not exists agricultural_operations_created_by_fk_idx
  on public.agricultural_operations(created_by);
create index if not exists agricultural_operations_field_tenant_fk_idx
  on public.agricultural_operations(field_id, organization_id);
create index if not exists command_receipts_actor_user_fk_idx
  on public.command_receipts(actor_user_id);
create index if not exists contractor_jobs_operation_tenant_fk_idx
  on public.contractor_jobs(agricultural_operation_id, organization_id);
create index if not exists contractor_jobs_client_party_fk_idx
  on public.contractor_jobs(client_party_id);
create index if not exists contractor_jobs_team_tenant_fk_idx
  on public.contractor_jobs(operational_team_id, organization_id);
create index if not exists equipment_owner_party_fk_idx
  on public.equipment(owner_party_id);
create index if not exists establishments_client_party_fk_idx
  on public.establishments(client_party_id);
create index if not exists fields_establishment_tenant_fk_idx
  on public.fields(establishment_id, organization_id);
create index if not exists sync_conflicts_receipt_tenant_fk_idx
  on public.sync_conflicts(command_receipt_id, organization_id);
create index if not exists team_assignments_equipment_tenant_fk_idx
  on public.team_assignments(equipment_id, organization_id);
create index if not exists team_assignments_team_tenant_fk_idx
  on public.team_assignments(operational_team_id, organization_id);
create index if not exists team_assignments_party_fk_idx
  on public.team_assignments(party_id);
create index if not exists work_sessions_job_tenant_fk_idx
  on public.work_sessions(contractor_job_id, organization_id);
create index if not exists work_sessions_created_by_fk_idx
  on public.work_sessions(created_by);
create index if not exists work_sessions_team_tenant_fk_idx
  on public.work_sessions(operational_team_id, organization_id);
