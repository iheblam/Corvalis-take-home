import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/**
 * Filters live in the URL (?department=…&q=…): they survive a refresh, the back button
 * works, and a link can be shared. `set` replaces the history entry so typing does not
 * flood the back button.
 */
export function useUrlFilters() {
  const [params, setParams] = useSearchParams()
  const set = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(changes)) {
            if (v === null || v === '') next.delete(k)
            else next.set(k, v)
          }
          return next
        },
        { replace: true },
      ),
    [setParams],
  )
  return { params, set }
}
