import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import type { TourStep } from './tourSteps'
import { Button } from './ui'

const PAD = 8 // space between the element and the ring
const HEADER = 110 // sticky header height, kept clear when scrolling
const FIND_TIMEOUT = 3000

interface Rect { top: number; left: number; width: number; height: number }

function findTarget(target: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 4 && r.height > 4 ? el : null // ignore empty / hidden containers
}

function scrollToTarget(el: HTMLElement) {
  if (el.closest('header')) return // the nav bar is always visible
  const r = el.getBoundingClientRect()
  const room = window.innerHeight - HEADER
  const top =
    r.height > room * 0.6
      ? window.scrollY + r.top - HEADER - 16 // tall element: show its top
      : window.scrollY + r.top - HEADER - (room - r.height) / 2 // otherwise centre it
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

/**
 * Full-screen coach marks: the current step's element stays sharp inside a pulsing ring,
 * everything else is dimmed and blurred, and a card explains it.
 */
export function TourOverlay({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [rect, setRect] = useState<Rect | null>(null)
  const [searching, setSearching] = useState(true)
  const elRef = useRef<HTMLElement | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardH, setCardH] = useState(180)

  const step = steps[index]
  const last = index === steps.length - 1

  const go = (d: 1 | -1) => {
    const next = index + d
    if (next < 0) return
    if (next >= steps.length) return onClose()
    setDirection(d)
    setIndex(next)
  }

  // 1. Open the right page, wait for the element, scroll it into view.
  useEffect(() => {
    if (!step) return
    setSearching(true)
    elRef.current = null
    if (location.pathname !== step.path) navigate(step.path)

    const started = Date.now()
    let timer = 0
    const look = () => {
      const el = findTarget(step.target)
      if (el) {
        elRef.current = el
        scrollToTarget(el)
        setSearching(false)
      } else if (Date.now() - started > FIND_TIMEOUT) {
        // Element not on this screen (e.g. nothing to approve): skip the step.
        if (index + direction >= 0 && index + direction < steps.length) setIndex(index + direction)
        else onClose()
      } else {
        timer = window.setTimeout(look, 100)
      }
    }
    look()
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, steps])

  // 2. Follow the element every frame (scrolling, resizing, data loading).
  useEffect(() => {
    let frame = 0
    const tick = () => {
      const el = elRef.current
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect()
        setRect((prev) =>
          prev && Math.abs(prev.top - r.top) < 0.5 && Math.abs(prev.left - r.left) < 0.5 &&
          Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5
            ? prev
            : { top: r.top, left: r.left, width: r.width, height: r.height },
        )
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight)
  })

  // 3. Keyboard: → next, ← back, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Lock page scroll by wheel/touch while the tour is open (we scroll for the user).
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault()
    window.addEventListener('wheel', prevent, { passive: false })
    window.addEventListener('touchmove', prevent, { passive: false })
    return () => {
      window.removeEventListener('wheel', prevent)
      window.removeEventListener('touchmove', prevent)
    }
  }, [])

  if (!step) return null

  // Hole = element + padding, clipped to the screen.
  const vw = window.innerWidth
  const vh = window.innerHeight
  const hole = rect && !searching
    ? (() => {
        const top = Math.max(4, rect.top - PAD)
        const left = Math.max(4, rect.left - PAD)
        const bottom = Math.min(vh - 4, rect.top + rect.height + PAD)
        const right = Math.min(vw - 4, rect.left + rect.width + PAD)
        return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
      })()
    : { top: vh / 2, left: vw / 2, width: 0, height: 0 }

  // Card: below the hole if it fits, else above, else pinned to the bottom of the screen.
  const cardW = Math.min(360, vw - 24)
  const gap = 14
  let cardTop: number
  if (hole.top + hole.height + gap + cardH < vh - 8) cardTop = hole.top + hole.height + gap
  else if (hole.top - gap - cardH > 8) cardTop = hole.top - gap - cardH
  else cardTop = vh - cardH - 16
  const cardLeft = Math.min(Math.max(12, hole.left + hole.width / 2 - cardW / 2), vw - cardW - 12)

  const shade = 'fixed bg-slate-900/55 backdrop-blur-[3px] transition-all duration-300 ease-out'

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* Four panels around the hole: dim + blur everything except the element. */}
      <div className={shade} style={{ top: 0, left: 0, right: 0, height: hole.top }} onClick={onClose} />
      <div className={shade} style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }} onClick={onClose} />
      <div className={shade} style={{ top: hole.top, left: 0, width: hole.left, height: hole.height }} onClick={onClose} />
      <div className={shade} style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }} onClick={onClose} />

      {/* The circle around the element. Clicks go through, so the element stays usable. */}
      {!searching && rect && (
        <>
          <div
            className="pointer-events-none fixed rounded-xl ring-4 ring-blue-400 transition-all duration-300 ease-out"
            style={{ ...hole, boxShadow: '0 0 0 6px rgba(59,130,246,.25), 0 0 32px 8px rgba(59,130,246,.45)' }}
          />
          <div
            key={step.id}
            className="pointer-events-none fixed animate-ping rounded-xl border-2 border-blue-300 [animation-iteration-count:2]"
            style={hole}
          />
        </>
      )}

      <div
        ref={cardRef}
        className="fixed rounded-xl bg-white p-4 shadow-2xl ring-1 ring-slate-200 transition-all duration-300 ease-out"
        style={{ top: cardTop, left: cardLeft, width: cardW }}
      >
        {searching ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" /> Opening the page…
          </p>
        ) : (
          <>
            <p className="text-xs font-medium text-blue-600">
              Step {index + 1} of {steps.length}
            </p>
            <h3 id="tour-title" className="mt-0.5 font-semibold text-slate-900">{step.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{step.body}</p>
          </>
        )}
        <div className="mt-4 flex items-center justify-between gap-2">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">
            {last ? 'Close' : 'Skip tour'}
          </button>
          <div className="flex items-center gap-2">
            <div className={`mr-1 gap-1 ${steps.length <= 8 ? 'flex' : 'hidden'}`} aria-hidden>
              {steps.map((s, i) => (
                <span key={s.id} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-blue-600' : 'w-1.5 bg-slate-300'}`} />
              ))}
            </div>
            {index > 0 && <Button variant="ghost" className="!px-3 !py-1.5" onClick={() => go(-1)}>Back</Button>}
            <Button className="!px-3 !py-1.5" onClick={() => go(1)} disabled={searching}>{last ? 'Done' : 'Next'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
