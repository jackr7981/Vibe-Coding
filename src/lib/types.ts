export type CrewStatus = "home" | "in_transit" | "at_airport" | "on_board" | "at_port";
export type UserRole = "admin" | "crew_manager" | "operations" | "crew" | "agent";
export type TravelLegStatus = "scheduled" | "active" | "completed" | "cancelled" | "delayed";
export type EventType =
  | "status_change"
  | "location_update"
  | "checkin"
  | "flight_departed"
  | "flight_arrived"
  | "agent_pickup"
  | "agent_dropoff"
  | "vessel_joined"
  | "vessel_left";

export interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface Profile {
  id: string;
  company_id: string;
  role: UserRole;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Vessel {
  id: string;
  company_id: string;
  name: string;
  imo_number: string | null;
  vessel_type: string | null;
  flag_state: string | null;
  current_port: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CrewMember {
  id: string;
  profile_id: string | null;
  company_id: string;
  employee_id: string;
  full_name: string;
  nationality: string | null;
  rank: string | null;
  department: string | null;
  passport_number: string | null;
  cdc_number: string | null;
  phone: string | null;
  emergency_contact: Record<string, unknown> | null;
  home_country: string | null;
  home_city: string | null;
  current_status: CrewStatus;
  current_location_label: string | null;
  assigned_vessel_id: string | null;
  last_status_update: string;
  metadata: Record<string, unknown>;
  created_at: string;
  // Contract
  contract_start_date: string | null;
  contract_end_date: string | null;
  contract_duration_months: number | null;
  // From crew_with_coords view
  lat: number | null;
  lng: number | null;
  vessel_name: string | null;
}

export interface TravelItinerary {
  id: string;
  company_id: string;
  crew_member_id: string;
  purpose: string | null;
  origin_location: string | null;
  destination_location: string | null;
  destination_vessel_id: string | null;
  status: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  travel_legs?: TravelLeg[];
  crew_member?: { full_name: string; rank: string | null };
}

export interface TravelLeg {
  id: string;
  itinerary_id: string;
  leg_order: number;
  mode: string;
  airline: string | null;
  flight_number: string | null;
  pnr: string | null;
  booking_reference: string | null;
  ticket_url: string | null;
  departure_location: string | null;
  departure_airport_code: string | null;
  departure_time: string | null;
  arrival_location: string | null;
  arrival_airport_code: string | null;
  arrival_time: string | null;
  status: TravelLegStatus;
  actual_departure: string | null;
  actual_arrival: string | null;
  pickup_agent_id: string | null;
  dropoff_agent_id: string | null;
  pickup_confirmed: boolean;
  dropoff_confirmed: boolean;
  pickup_time: string | null;
  dropoff_time: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface StatusEvent {
  id: string;
  company_id: string;
  crew_member_id: string;
  event_type: EventType;
  previous_status: CrewStatus | null;
  new_status: CrewStatus | null;
  location_label: string | null;
  travel_leg_id: string | null;
  reported_by: string | null;
  source: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  crew_members?: { full_name: string; rank: string | null };
}

export interface Notification {
  id: string;
  company_id: string;
  recipient_id: string;
  title: string;
  body: string | null;
  type: string | null;
  related_crew_id: string | null;
  related_itinerary_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface StatusCount {
  status: CrewStatus;
  count: number;
}

export interface VesselCrewCount {
  vessel_id: string;
  vessel_name: string;
  crew_count: number;
}

export interface DashboardStats {
  statusCounts: StatusCount[];
  recentEvents: StatusEvent[];
  activeTrips: TravelItinerary[];
  vesselCounts: VesselCrewCount[];
}
