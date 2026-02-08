export enum AppView {
  LANDING = 'LANDING',
  LOGIN = 'LOGIN',
  REGISTER = 'REGISTER',
  VERIFY_EMAIL = 'VERIFY_EMAIL',
  PROFILE_SETUP = 'PROFILE_SETUP',
  DASHBOARD = 'DASHBOARD',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD',
}

export enum Department {
  DECK = 'Deck',
  ENGINE = 'Engine',
  ELECTRICAL = 'Electrical',
  GALLEY = 'Galley',
  CREWING = 'Crewing',
  AGENCY = 'Agency',
  DECK_RATINGS = 'Deck Ratings',
  ENGINE_RATINGS = 'Engine Ratings',
}

export enum Rank {
  // Deck
  MASTER = 'Master',
  CHIEF_OFFICER = 'Chief Officer',
  SECOND_OFFICER = '2nd Officer',
  THIRD_OFFICER = '3rd Officer',
  FOURTH_OFFICER = '4th Officer',
  DECK_CADET = 'Deck Cadet',
  
  // Engine
  CHIEF_ENGINEER = 'Chief Engineer',
  SECOND_ENGINEER = '2nd Engineer',
  THIRD_ENGINEER = '3rd Engineer',
  FOURTH_ENGINEER = '4th Engineer',
  FIFTH_ENGINEER = '5th Engineer',
  ENGINE_CADET = 'Engine Cadet',
  
  // Electrical
  ELECTRICAL_OFFICER = 'Electrical Officer (ETO)',
  
  // Ratings
  BOSUN = 'Bosun',
  ABLE_SEAMAN = 'Able Seaman',
  ORDINARY_SEAMAN = 'Ordinary Seaman',
  FITTER = 'Fitter',
  MOTORMAN = 'Motorman',
  OILER = 'Oiler',
  WIPER = 'Wiper',
  WELDER = 'Welder',
  
  // Galley
  CHIEF_COOK = 'Chief Cook',
  MESSMAN = 'Messman',
  
  // Others
  CREW_MANAGER = 'Crew Manager',
  AGENT = 'Agent',
  OTHER = 'Other'
}

export enum ShipType {
  BULK_CARRIER = 'Bulk Carrier',
  CONTAINER = 'Container',
  OIL_TANKER = 'Oil Tanker',
  CHEMICAL_TANKER = 'Chemical Tanker',
  LPG_TANKER = 'LPG Tanker',
  LNG_TANKER = 'LNG Tanker',
  CAR_CARRIER = 'Car Carrier (PCTC)',
  GENERAL_CARGO = 'General Cargo',
  RO_RO = 'Ro-Ro',
  OFFSHORE = 'Offshore/Supply',
  PASSENGER = 'Passenger/Cruise',
  OTHER = 'Other'
}

export enum DocumentCategory {
  CERTIFICATE = 'Certificate',
  LICENSE = 'License',
  PERSONAL_ID = 'Personal ID',
  MEDICAL = 'Medical',
  VISA = 'Visa',
  OTHER = 'Other'
}

export interface SeaServiceRecord {
  id: string;
  vesselName: string;
  rank: string;
  shipType?: ShipType | string; // Added Ship Type
  signOnDate: string;
  signOffDate: string;
  imoNumber?: string;
  duration?: string;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  department: Department | '';
  rank: Rank | string;
  cdcNumber: string;
  mobileNumber: string;
  dateOfBirth: string;
  profilePicture: string | null; // Base64 string
  seaServiceHistory?: SeaServiceRecord[];
  preferredShipType?: ShipType | string;
  isOpenForWork?: boolean;
  isOnboard?: boolean; // New field: true = At Sea, false = At Home
}

export interface User {
  id?: string; // Added ID for admin referencing
  email: string;
  isVerified: boolean;
  profile?: UserProfile;
}

export interface MarinerDocument {
  id: string;
  title: string;
  expiryDate: string; // YYYY-MM-DD
  documentNumber: string;
  fileUrl: string; // Base64 (Thumbnail or First Page)
  pages?: string[]; // Array of Base64 strings for multi-page documents
  uploadDate: number;
  category: DocumentCategory | string;
}

export interface ManningAgent {
  id: string;
  licenseNumber: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  status: 'Active' | 'Suspended' | 'Expired';
  cities?: string[]; // Added for filtering
}

export interface MedicalCenter {
  id: string;
  name: string; // Center name or Doctor name
  approvalNumber: string; // DG Shipping Approval No
  address: string;
  phone: string;
  city: 'Dhaka' | 'Chittagong' | 'Khulna' | 'Other';
  status: 'Approved' | 'Suspended';
  isCenter: boolean; // True if diagnostic center, False if individual doctor chamber
}

// Job Board Types
export interface JobPosting {
  id: string;
  rank: string;
  shipType: string;
  wage?: string;
  joiningDate?: string;
  description: string;
  contactInfo: string; // Phone or Email
  source: 'WhatsApp' | 'Telegram' | 'Direct' | 'Other';
  postedDate: number;
  companyName?: string;
}

// Forum Types
export enum ForumCategory {
  GENERAL = 'General',
  DECK = 'Deck Dept',
  ENGINE = 'Engine Dept',
  AGENCY = 'Agency/Jobs',
  EXAMS = 'Exams & DOCS',
  SEA_LIFE = 'Sea Life',
}

export type IdentityOption = 'Real Name' | 'Rank' | 'Anonymous';

export interface ForumComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string; // Computed based on IdentityOption
  authorRank?: string; // Optional, shown if Identity is Real Name or Rank
  content: string;
  timestamp: number;
  identityType: IdentityOption;
}

export interface ForumPost {
  id: string;
  authorId: string;
  authorName: string; // Computed based on IdentityOption
  authorRank?: string;
  identityType: IdentityOption;
  category: ForumCategory;
  title: string;
  content: string;
  imageUrl?: string;
  timestamp: number;
  likes: number;
  commentCount: number;
  comments?: ForumComment[]; // Optional for list view, populated in detail
}

// Chat Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}