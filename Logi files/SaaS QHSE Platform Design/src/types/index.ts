// User types
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'manager' | 'employee';
  department: string;
  position: string;
  signature?: string;
  avatar?: string;
}

// Risk types
export interface Risk {
  id: string;
  code: string;
  process: string;
  description: string;
  causes: string;
  probability: number;
  severity: number;
  criticality: number;
  status: 'open' | 'in-progress' | 'closed';
  actions: string;
  responsibleId: string;
  createdAt: string;
  updatedAt: string;
}

// Action types
export interface Action {
  id: string;
  code: string;
  title: string;
  description: string;
  type: 'corrective' | 'preventive' | 'improvement';
  responsibleId: string;
  startDate: string;
  dueDate: string;
  completedDate?: string;
  status: 'open' | 'in-progress' | 'completed' | 'overdue';
  progress: number;
  proof?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

// Equipment types
export interface Equipment {
  id: string;
  code: string;
  name: string;
  category: string;
  location: string;
  status: 'operational' | 'maintenance' | 'broken' | 'retired';
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  maintenanceFrequency: string;
  proof?: string;
  responsibleId: string;
}

// Training types
export interface Training {
  id: string;
  code: string;
  title: string;
  employeeId: string;
  department: string;
  frequency: string;
  lastDate: string;
  nextDate: string;
  status: 'done' | 'pending' | 'cancelled' | 'overdue';
  proof?: string;
  mandatory: boolean;
  validityPeriod: number; // in months
}

// Document types
export interface Document {
  id: string;
  code: string;
  name: string;
  type: string;
  level: string;
  process: string;
  axes: string[];
  version: string;
  status: 'draft' | 'review' | 'approved' | 'obsolete';
  authorId: string;
  createdAt: string;
  updatedAt: string;
  fileUrl: string;
  fileSize: number;
}

// Audit types
export interface Audit {
  id: string;
  code: string;
  title: string;
  type: 'internal' | 'external' | 'certification';
  scope: string[];
  auditorId: string;
  scheduledDate: string;
  completedDate?: string;
  status: 'planned' | 'in-progress' | 'completed' | 'cancelled';
  findings: Finding[];
  reportUrl?: string;
}

export interface Finding {
  id: string;
  type: 'conformity' | 'minor' | 'major' | 'opportunity';
  description: string;
  reference: string;
  actionRequired: boolean;
  actionId?: string;
}

// Objective types
export interface Objective {
  id: string;
  code: string;
  title: string;
  description: string;
  category: 'quality' | 'environment' | 'safety';
  target: number;
  unit: string;
  currentValue: number;
  deadline: string;
  responsibleId: string;
  status: 'on-track' | 'at-risk' | 'behind' | 'achieved';
  indicators: Indicator[];
}

export interface Indicator {
  id: string;
  name: string;
  value: number;
  date: string;
}

// Stakeholder types
export interface Stakeholder {
  id: string;
  name: string;
  type: 'client' | 'supplier' | 'employee' | 'authority' | 'partner' | 'other';
  needs: string[];
  expectations: string[];
  contactPerson?: string;
  email?: string;
  phone?: string;
}

// Notification types
export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'danger';
  read: boolean;
  createdAt: string;
  link?: string;
}

// Company settings
export interface CompanySettings {
  id: string;
  name: string;
  industry: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  certifications: string[];
  logo?: string;
  subscriptionPlan: 'starter' | 'professional' | 'enterprise';
  subscriptionEndDate: string;
}
