-- SURKARA legacy lifecycle reconciliation.
-- Older builds created WorkSessions without advancing ContractorJob ready -> active.
-- Reconcile only jobs that are still ready and have execution evidence.

update public.contractor_jobs cj
   set status = 'active',
       revision = revision + 1,
       updated_at = clock_timestamp()
 where cj.status = 'ready'
   and exists (
     select 1
       from public.work_sessions ws
      where ws.organization_id = cj.organization_id
        and ws.contractor_job_id = cj.id
   );
