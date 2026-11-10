import { supabase } from '@/lib/supabase'

/*
  El código que sigue, para una ficha nueva: el mayor de los numéricos
  más uno. Es una sugerencia; quien carga lo puede cambiar.

  Sin conexión, o si algo falla, devuelve vacío y el campo queda como
  antes: que no se pueda sugerir no es motivo para frenar la carga.
*/
export async function siguienteCodigo(de: 'producto' | 'cliente'): Promise<string> {
  try {
    const { data, error } = await supabase.rpc(
      de === 'producto' ? 'siguiente_codigo_producto' : 'siguiente_codigo_cliente',
    )
    if (error || typeof data !== 'string') return ''
    return data
  } catch {
    return ''
  }
}
