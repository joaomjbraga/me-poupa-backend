export interface User {
  id: string;
  name: string;
  email: string;
  password_hash?: string;
  avatar_color: string;
  avatar_image: string | null;
  family_id: string | null;
  invite_code: string;
  created_at: Date;
  updated_at: Date;
  [key: string]: unknown;
}

export interface UserPublic {
  id: string;
  name: string;
  email: string;
  avatar_color: string;
  avatar_image: string | null;
  family_id: string | null;
  invite_code: string;
  created_at: Date;
}

export interface Category {
  id: string;
  user_id: string;
  family_id: string | null;
  name: string;
  icon: string;
  color: string;
  type: 'income' | 'expense';
  created_at: Date;
}

export interface Transaction {
  id: string;
  user_id: string;
  family_id: string | null;
  category_id: string | null;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  date: Date;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  user_name?: string;
  user_color?: string;
}

export interface TransactionSummary {
  total_income: string;
  total_expense: string;
  balance: string;
}

export interface CategorySummary {
  name: string;
  icon: string;
  color: string;
  type: 'income' | 'expense';
  total: string;
}

export interface HistoryEntry {
  year: number;
  month: number;
  total_income: string;
  total_expense: string;
}

export interface Notification {
  id: string;
  user_id: string;
  family_id: string | null;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: Date;
  from_user_name?: string;
  from_user_color?: string;
}

export interface JwtPayload {
  userId: string;
  familyId: string | null;
}

export interface AuthToken {
  token: string;
  user: UserPublic;
}

export interface ApiError {
  error: string;
}

export interface ApiSuccess {
  message: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  email: string;
  avatar_color: string;
  avatar_image: string | null;
}

export interface TransactionCreate {
  type: 'income' | 'expense';
  amount: number;
  description: string;
  date: string;
  notes?: string;
  category_id?: string;
}

export interface TransactionUpdate extends TransactionCreate {}

export interface CategoryCreate {
  name: string;
  type: 'income' | 'expense';
  icon?: string;
  color?: string;
}

export interface CategoryUpdate extends CategoryCreate {}
