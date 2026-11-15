import {
  Briefcase, Calendar, Crown, Folder, GraduationCap, Headset, Heart, List, ListTodo, Megaphone, Phone, Rocket,
  ShieldCheck, Sparkles, Star, Stethoscope, Users, Wallet, Wrench, type LucideIcon,
} from 'lucide-react'

/** Icone selezionabili per le liste (nome lucide in kebab-case, come salvato nel backend). */
export const ICONE_LISTA: Record<string, LucideIcon> = {
  list: List,
  // Liste importate da ClickUp
  'list-todo': ListTodo,
  headset: Headset,
  briefcase: Briefcase,
  users: Users,
  'shield-check': ShieldCheck,
  crown: Crown,
  phone: Phone,
  calendar: Calendar,
  wallet: Wallet,
  stethoscope: Stethoscope,
  megaphone: Megaphone,
  folder: Folder,
  star: Star,
  heart: Heart,
  rocket: Rocket,
  wrench: Wrench,
  'graduation-cap': GraduationCap,
  sparkles: Sparkles,
}

export const COLORI_LISTA = [
  '#0EA5E9', '#6366F1', '#8B5CF6', '#EC4899', '#EF4444',
  '#F59E0B', '#10B981', '#14B8A6', '#64748B', '#1F3A63',
]
