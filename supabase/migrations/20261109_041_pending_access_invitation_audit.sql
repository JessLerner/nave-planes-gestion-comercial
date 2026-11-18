-- Audit trail for the safe reissue or pre-verification email correction of an invitation.
-- Auth accounts are never changed through SQL; the Worker uses Supabase Auth Admin APIs.
alter table public.access_account_audit
  drop constraint if exists access_account_audit_action_check;
alter table public.access_account_audit
  add constraint access_account_audit_action_check
  check (action in ('invited','permissions_updated','invitation_resent','pending_invitation_email_changed'));
