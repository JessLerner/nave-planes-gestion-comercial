alter table public.incorporation_request_audit
  drop constraint incorporation_request_audit_event_type_check,
  add constraint incorporation_request_audit_event_type_check
    check (event_type in ('draft_deleted', 'rrhh_direct_authorized', 'correction_resubmitted'));
