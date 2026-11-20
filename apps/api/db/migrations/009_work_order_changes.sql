ALTER TABLE runline.work_orders
  DROP CONSTRAINT work_orders_status_check,
  ADD CONSTRAINT work_orders_status_check CHECK (
    status IN ('UNASSIGNED', 'SCHEDULED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED', 'CANCELLED')
  ),
  DROP CONSTRAINT work_order_schedule_shape,
  ADD CONSTRAINT work_order_schedule_shape CHECK (
    (status IN ('UNASSIGNED', 'CANCELLED') AND technician_id IS NULL AND service_date IS NULL
      AND start_minute IS NULL AND duration_minutes IS NULL)
    OR (status IN ('SCHEDULED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED') AND technician_id IS NOT NULL
      AND service_date IS NOT NULL AND start_minute IS NOT NULL AND duration_minutes IS NOT NULL
      AND start_minute >= 420 AND duration_minutes >= 15 AND start_minute + duration_minutes <= 1140)
  );

ALTER TABLE runline.work_order_events
  DROP CONSTRAINT work_order_events_action_check,
  ADD CONSTRAINT work_order_events_action_check CHECK (
    action IN ('CREATED', 'ASSIGNED', 'RESCHEDULED', 'STATUS_CHANGED', 'EDITED', 'CANCELLED')
  ),
  ADD COLUMN reason text,
  ADD CONSTRAINT work_order_event_reason_check CHECK (
    (action = 'CANCELLED' AND status = 'CANCELLED' AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 500)
    OR (action <> 'CANCELLED' AND reason IS NULL)
  );

GRANT UPDATE (address, priority, notes, destination) ON runline.work_orders TO runline_app;

CREATE FUNCTION runline.guard_dispatch_changes() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $guard$
BEGIN
  IF current_user = 'runline_app' AND (
    NEW.address IS DISTINCT FROM OLD.address OR NEW.priority IS DISTINCT FROM OLD.priority
    OR NEW.notes IS DISTINCT FROM OLD.notes OR NEW.destination IS DISTINCT FROM OLD.destination
    OR NEW.status = 'CANCELLED' OR OLD.status = 'CANCELLED'
  ) THEN
    IF runline.is_dispatch_staff() IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Only dispatch staff can edit or cancel work orders' USING ERRCODE = '42501';
    END IF;
    IF OLD.status NOT IN ('UNASSIGNED', 'SCHEDULED') THEN
      RAISE EXCEPTION 'Only unassigned or scheduled work orders can be edited or cancelled' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$guard$;

CREATE TRIGGER guard_dispatch_changes BEFORE UPDATE OF address, priority, notes, destination, status
  ON runline.work_orders FOR EACH ROW EXECUTE FUNCTION runline.guard_dispatch_changes();
