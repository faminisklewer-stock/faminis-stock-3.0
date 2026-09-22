import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null

export type Role = 'MASTER' | 'OWNER' | 'WAREHOUSE' | 'LIVE' | 'RUKO'

export type Profile = {
  id: string
  full_name: string
  role: Role
  location_id: string | null
  active: boolean
}
