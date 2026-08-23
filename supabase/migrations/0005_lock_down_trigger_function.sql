-- touch_updated_at is a trigger function (fires automatically on UPDATE),
-- not meant to be called directly. Calling it outside trigger context
-- would error harmlessly (NEW/OLD aren't defined), so this isn't an active
-- exploit like apply_items was — just tightening an unnecessarily broad
-- default grant while we're auditing this file.
revoke execute on function public.touch_updated_at ()
from
  public,
  anon,
  authenticated;
