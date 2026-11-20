import type { PoolClient } from "pg";
import type { demoTenants } from "../auth/demo-fixtures.js";
import type { NewJob } from "./contracts.js";
import { appendJobEvent } from "./mutations.js";

type DemoTenant = (typeof demoTenants)[number];
type DemoJob = NewJob & {
  id: string;
  appointment?: {
    technician: "primary" | "extra" | "specialist";
    startMinute: number;
    durationMinutes: number;
    status?: "ARRIVED" | "COMPLETED";
    date?: string;
    dayOffset?: number;
  };
};

export const demoBillingJobs = {
  "apex-hvac": "71338686-5478-45b8-aa7a-9d307bee25d3",
  "metro-plumbing": "db023d14-ab30-4ea7-bbef-ae277e044918",
} satisfies Record<DemoTenant["slug"], string>;

export const emergencyDemoJob: NewJob = {
  title: "Cooling system stopped",
  customerName: "Summit Dental",
  address: "14 Sample Lane, Service District",
  notes: "The clinic reports warm air from every vent. Confirm the fault on site.",
  priority: "EMERGENCY",
  destination: { latitude: 14.5595, longitude: 121.0252 },
  requiredSkills: ["EPA-608"],
};

export const pipeDemoJob: NewJob = {
  title: "Burst supply pipe",
  customerName: "Elm Court",
  address: "18 Example Avenue, Service District",
  notes: "Water was shut off at the service valve.",
  priority: "EMERGENCY",
  destination: { latitude: 14.5475, longitude: 121.011 },
  requiredSkills: ["MASTER-PLUMBER"],
};

const jobs: Record<DemoTenant["slug"], DemoJob[]> = {
  "apex-hvac": [
    {
      id: demoBillingJobs["apex-hvac"], title: "Completed cooling inspection",
      customerName: "Santos Residence", address: "42 Example Avenue, Service District",
      notes: "Inspect the cooling system and confirm normal operation.", priority: "STANDARD",
      appointment: { technician: "primary", startMinute: 660, durationMinutes: 60, status: "COMPLETED", date: "2025-01-10" },
    },
    { id: "f117267f-3d14-4fa3-a0a8-d9c2424fe8a9", ...emergencyDemoJob },
    {
      id: "59103c5f-dfc2-42a6-9bd4-a507096d7068", title: "Uneven airflow",
      customerName: "Riverbend Studio", address: "22 Example Avenue, Service District",
      notes: "Check airflow in the upstairs treatment room.", priority: "HIGH",
    },
    {
      id: "7add9fe8-8ab7-4f2a-8f02-fa227df2fa2a", title: "Seasonal maintenance",
      customerName: "Cedar House", address: "35 Acacia Lane, Service District",
      notes: "Inspect filters and record the unit condition.", priority: "STANDARD",
      destination: { latitude: 14.5554, longitude: 121.0226 },
      requiredSkills: ["EPA-608"],
      appointment: { technician: "primary", startMinute: 540, durationMinutes: 90 },
    },
    {
      id: "dc266a4e-0949-48a4-980a-b6707b1c43c2", title: "Thermostat replacement",
      customerName: "Pinecrest Office", address: "7 Sample Lane, Service District",
      notes: "The customer has confirmed access at reception.", priority: "STANDARD",
      destination: { latitude: 14.558, longitude: 121.039 },
      requiredSkills: ["THERMOSTATS"],
      appointment: { technician: "extra", startMinute: 630, durationMinutes: 60 },
    },
    {
      id: "b623cbe7-7eef-41d2-bb7a-54c157e38d50", title: "Freezer temperature rising",
      customerName: "Orchard Bakery", address: "18 Narra Lane, Kapitolyo",
      notes: "The walk-in freezer alarmed twice during the morning prep shift.", priority: "HIGH",
      destination: { latitude: 14.5724, longitude: 121.0612 }, requiredSkills: ["REFRIGERATION"],
    },
    {
      id: "ce9e31b2-8f9d-4ca8-aeb2-43f212bfe9ef", title: "Condensate line leaking",
      customerName: "Southbank Books", address: "52 Molave Row, Poblacion",
      notes: "Water is pooling beneath the indoor unit after long run cycles.", priority: "HIGH",
      destination: { latitude: 14.565, longitude: 121.0322 }, requiredSkills: ["AIRFLOW"],
    },
    {
      id: "4f93c602-0c78-4a27-8ffb-a62fbc20424f", title: "Quarterly filter service",
      customerName: "Alba Studio", address: "11 Ipil Court, San Antonio",
      notes: "Replace intake filters and log the sizes for the next visit.", priority: "STANDARD",
      destination: { latitude: 14.563, longitude: 121.0123 },
    },
    {
      id: "854d274c-b0eb-4724-a504-61e1700f76f1", title: "Cold-room startup check",
      customerName: "Harbor Pantry", address: "9 Yakal Court, Chino Roces",
      notes: "Verify the temperature drops after startup and confirm the door seal.", priority: "STANDARD",
      destination: { latitude: 14.5537, longitude: 121.0136 }, requiredSkills: ["REFRIGERATION"],
      appointment: { technician: "primary", startMinute: 465, durationMinutes: 45 },
    },
    {
      id: "96b1dc72-00d3-472e-bef2-274b44ec94dd", title: "Zone controller calibration",
      customerName: "Verde Learning Center", address: "6 Narra Lane, Mandaluyong",
      notes: "Compare room sensor readings against the controller setpoint.", priority: "STANDARD",
      destination: { latitude: 14.5834, longitude: 121.046 }, requiredSkills: ["THERMOSTATS"],
      appointment: { technician: "extra", startMinute: 840, durationMinutes: 90 },
    },
    {
      id: "0b7d07a1-98bf-47ab-9943-8ca83cd15166", title: "Supply duct balancing",
      customerName: "Mosaic Office", address: "27 Molave Row, Salcedo",
      notes: "Measure airflow at the three upper-floor registers.", priority: "HIGH",
      destination: { latitude: 14.5587, longitude: 121.0267 }, requiredSkills: ["DUCTWORK"],
      appointment: { technician: "specialist", startMinute: 600, durationMinutes: 120, status: "ARRIVED" },
    },
    {
      id: "a7b2587b-5742-4f9d-bbb7-3aa9689deca0", title: "Return grille inspection",
      customerName: "Fern House", address: "33 Ipil Court, Guadalupe",
      notes: "Inspect the return grille and clear the obstruction.", priority: "STANDARD",
      destination: { latitude: 14.5669, longitude: 121.0447 }, requiredSkills: ["AIRFLOW"],
      appointment: { technician: "specialist", startMinute: 480, durationMinutes: 45, status: "COMPLETED" },
    },
    {
      id: "fb304ab4-04e4-4a36-be97-4aa961082b0f", title: "Thermostat wiring inspection",
      customerName: "Beacon Clinic", address: "8 Yakal Court, Legazpi",
      notes: "Check the control wiring and cycle the unit after inspection.", priority: "STANDARD",
      requiredSkills: ["THERMOSTATS"],
      appointment: { technician: "extra", startMinute: 600, durationMinutes: 60, status: "COMPLETED", dayOffset: -2 },
    },
    {
      id: "5858e2fb-6aa4-4388-b034-bfaf9bf12e38", title: "Rooftop unit maintenance",
      customerName: "Linden Square", address: "42 Narra Lane, Bonifacio",
      notes: "Arrange roof access with the facilities desk before servicing the unit.", priority: "STANDARD",
      destination: { latitude: 14.5511, longitude: 121.0487 }, requiredSkills: ["EPA-608"],
      appointment: { technician: "primary", startMinute: 540, durationMinutes: 120, dayOffset: 1 },
    },
  ],
  "metro-plumbing": [
    {
      id: demoBillingJobs["metro-plumbing"], title: "Completed water line inspection",
      customerName: "Marigold Cafe", address: "26 Acacia Lane, Service District",
      notes: "Inspect the water line and confirm normal pressure.", priority: "STANDARD",
      appointment: { technician: "primary", startMinute: 660, durationMinutes: 60, status: "COMPLETED", date: "2025-01-10" },
    },
    { id: "51455e93-240b-4d13-9ed7-df118fc751ac", ...pipeDemoJob },
    {
      id: "7f6d2062-b672-42eb-8d01-be900a4017d0", title: "Water pressure check",
      customerName: "Cypress Market", address: "28 Acacia Lane, Service District",
      notes: "Verify pressure at the prep area and main supply.", priority: "STANDARD",
      destination: { latitude: 14.5657, longitude: 121.0326 },
      requiredSkills: ["MASTER-PLUMBER"],
      appointment: { technician: "primary", startMinute: 540, durationMinutes: 60 },
    },
    {
      id: "46527200-56f2-4f78-ba0a-8a861014ec19", title: "Kitchen drain backing up",
      customerName: "Solana Canteen", address: "26 Balete Street, San Antonio",
      notes: "The prep sink drains slowly during service. Check the trap and branch line.", priority: "HIGH",
      destination: { latitude: 14.5598, longitude: 121.0179 }, requiredSkills: ["DRAIN-SERVICE"],
    },
    {
      id: "b2c0364b-77ea-411f-b490-c818d49d4ff5", title: "Restroom fixture leak",
      customerName: "Meridian Arcade", address: "7 Camia Court, Pasay",
      notes: "A shutoff valve under the ground-floor basin is dripping.", priority: "HIGH",
      destination: { latitude: 14.5496, longitude: 121.0043 }, requiredSkills: ["FIXTURE-SERVICE"],
    },
    {
      id: "1bad70aa-fe89-4939-ae08-8a0a318b7e7c", title: "Supply hose replacement",
      customerName: "Parkside Laundry", address: "16 Mabolo Lane, Guadalupe",
      notes: "Replace the worn braided hose on the utility sink.", priority: "STANDARD",
      destination: { latitude: 14.5661, longitude: 121.044 }, requiredSkills: ["FIXTURE-SERVICE"],
    },
    {
      id: "23a509b7-b891-4c6f-9186-4e52226ee8e3", title: "Isolation valve inspection",
      customerName: "Tandem Studios", address: "39 Balete Street, Bel-Air",
      notes: "Check that the service valve closes fully and document the pressure reading.", priority: "STANDARD",
      destination: { latitude: 14.5622, longitude: 121.0309 }, requiredSkills: ["WATER-LINES"],
      appointment: { technician: "primary", startMinute: 870, durationMinutes: 60 },
    },
    {
      id: "bc0586a6-2f84-45e9-bff4-c5fd66cd8cf1", title: "Floor drain clearing",
      customerName: "Anchor Fitness", address: "5 Camia Court, Chino Roces",
      notes: "Clear the locker room drain and confirm the line flows under load.", priority: "STANDARD",
      destination: { latitude: 14.549, longitude: 121.0177 }, requiredSkills: ["DRAIN-SERVICE"],
      appointment: { technician: "extra", startMinute: 495, durationMinutes: 60 },
    },
    {
      id: "74fb71cd-e1a9-4f39-9da8-49d636326fc6", title: "Trace a concealed leak",
      customerName: "Birch House", address: "31 Mabolo Lane, Kapitolyo",
      notes: "Check the wall behind the service sink for moisture.", priority: "HIGH",
      destination: { latitude: 14.5759, longitude: 121.0607 }, requiredSkills: ["LEAK-DETECTION"],
      appointment: { technician: "specialist", startMinute: 660, durationMinutes: 90, status: "ARRIVED" },
    },
    {
      id: "1a45ec53-4c77-4e28-8c5c-e0a6a9ed2f56", title: "Cistern valve adjustment",
      customerName: "Canopy Clinic", address: "12 Balete Street, Poblacion",
      notes: "Adjust the fill valve and check for continuous running after flush.", priority: "STANDARD",
      destination: { latitude: 14.5672, longitude: 121.033 }, requiredSkills: ["FIXTURE-SERVICE"],
      appointment: { technician: "specialist", startMinute: 510, durationMinutes: 45, status: "COMPLETED" },
    },
    {
      id: "ab7a2c3a-00ea-4955-87cc-d892f66492cd", title: "Grease trap inspection",
      customerName: "Oriole Kitchen", address: "22 Camia Court, Mandaluyong",
      notes: "Inspect the kitchen trap and check the upstream sink connection.", priority: "STANDARD",
      requiredSkills: ["DRAIN-SERVICE"],
      appointment: { technician: "extra", startMinute: 675, durationMinutes: 60, status: "COMPLETED", dayOffset: -2 },
    },
    {
      id: "7f53c9ba-309e-46d6-bf04-1408eb47b511", title: "Washroom fixture service",
      customerName: "Elm Learning Hub", address: "14 Mabolo Lane, San Lorenzo",
      notes: "Check the three basin fixtures before the site opens.", priority: "STANDARD",
      destination: { latitude: 14.5483, longitude: 121.0264 }, requiredSkills: ["FIXTURE-SERVICE"],
      appointment: { technician: "specialist", startMinute: 540, durationMinutes: 75, dayOffset: 1 },
    },
  ],
};

export async function seedDemoJobs(client: Pick<PoolClient, "query">, tenant: DemoTenant) {
  const technicians = {
    primary: tenant.accounts.TECHNICIAN.id,
    extra: tenant.extraTechnicians[0].id,
    specialist: tenant.extraTechnicians[1].id,
  };
  for (const job of jobs[tenant.slug]) {
    const { appointment, destination } = job;
    const technicianId = appointment ? technicians[appointment.technician] : null;
    const inserted = await client.query(`
      INSERT INTO runline.work_orders (
        tenant_id, id, title, customer_name, address, notes, priority, status,
        technician_id, service_date, start_minute, duration_minutes, destination, required_skills
      )
      SELECT id, $2, $3, $4, $5, $6, $7,
             CASE WHEN $8::uuid IS NULL THEN 'UNASSIGNED' ELSE $11::text END,
             $8, CASE WHEN $8::uuid IS NOT NULL THEN COALESCE($12::date, (now() AT TIME ZONE time_zone)::date + $13::integer) END,
             $9, $10, ST_SetSRID(ST_MakePoint($14, $15), 4326)::geography, $16
      FROM runline.tenants WHERE id = $1
      ON CONFLICT DO NOTHING
    `, [tenant.id, job.id, job.title, job.customerName, job.address, job.notes, job.priority,
      technicianId, appointment?.startMinute ?? null, appointment?.durationMinutes ?? null,
      appointment?.status ?? "SCHEDULED", appointment?.date ?? null, appointment?.dayOffset ?? 0,
      destination?.longitude ?? null, destination?.latitude ?? null, job.requiredSkills ?? []]);
    if (inserted.rowCount) await appendJobEvent(client, tenant.id, job.id, null, "CREATED");
    else if (destination || job.requiredSkills?.length) {
      await client.query(`
        UPDATE runline.work_orders SET
          destination = CASE WHEN address = $6 THEN COALESCE(destination,
            ST_SetSRID(ST_MakePoint($3::double precision, $4::double precision), 4326)::geography) ELSE destination END,
          required_skills = CASE WHEN cardinality(required_skills) = 0 THEN $5 ELSE required_skills END
        WHERE tenant_id = $1 AND id = $2 AND (
          (address = $6 AND destination IS NULL AND $3::double precision IS NOT NULL AND $4::double precision IS NOT NULL)
          OR (cardinality(required_skills) = 0 AND cardinality($5::text[]) > 0)
        )
      `, [tenant.id, job.id, destination?.longitude ?? null, destination?.latitude ?? null, job.requiredSkills ?? [], job.address]);
    }
  }
}
