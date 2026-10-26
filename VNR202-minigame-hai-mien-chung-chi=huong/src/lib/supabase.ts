import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (
  import.meta.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL ?? ''
).trim()
const supabaseAnonKey = (
  import.meta.env.SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
).trim()

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

export const supabaseConfigMessage = hasSupabaseConfig
  ? 'Supabase đã được cấu hình. Sẵn sàng kết nối dữ liệu trận đấu.'
  : 'Cấu hình Supabase chưa hoàn tất. Vui lòng thêm SUPABASE_URL và SUPABASE_ANON_KEY vào cấu hình môi trường.'

export const supabaseClient = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null
