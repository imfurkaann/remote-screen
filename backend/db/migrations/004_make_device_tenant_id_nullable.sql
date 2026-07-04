-- Drop NOT NULL constraint on tenant_id in devices table to allow unassigned/unpaired devices
ALTER TABLE devices ALTER COLUMN tenant_id DROP NOT NULL;

-- Create a global unique index on hardware_id to ensure that a physical device 
-- cannot be registered multiple times under different rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_hardware_global
  ON devices(hardware_id)
  WHERE deleted_at IS NULL;
