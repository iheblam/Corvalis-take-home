// Small inline icon set (no extra dependency). Same icon = same page, in the nav and in the guide.
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 18, children, ...props }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {children}
    </svg>
  )
}

export const HomeIcon = (p: P) => (
  <Svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></Svg>
)
export const RequestIcon = (p: P) => (
  <Svg {...p}><rect x="3" y="4.5" width="18" height="16.5" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4M12 12.5v6M9 15.5h6" /></Svg>
)
export const ListIcon = (p: P) => (
  <Svg {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" /></Svg>
)
export const CalendarIcon = (p: P) => (
  <Svg {...p}><rect x="3" y="4.5" width="18" height="16.5" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /><path d="M7 13.5h2M11 13.5h2M15 13.5h2M7 17h2M11 17h2" /></Svg>
)
export const PeopleIcon = (p: P) => (
  <Svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14.5c2.4 0 4 1.5 4.5 4" /></Svg>
)
export const ApproveIcon = (p: P) => (
  <Svg {...p}><path d="M9 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" /><rect x="9" y="2.5" width="6" height="3.5" rx="1" /><path d="m8.5 13.5 2.5 2.5 4.5-5" /></Svg>
)
export const HelpIcon = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9.5" /><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 3.9" /><path d="M12 17.2h.01" strokeWidth={2.4} /></Svg>
)
export const UserSwitchIcon = (p: P) => (
  <Svg {...p}><circle cx="10" cy="8" r="3.5" /><path d="M3.5 20c.5-3.5 3.2-5.5 6.5-5.5 1.3 0 2.5.3 3.5.9" /><path d="m17 14 3 3-3 3M20 17h-6" /></Svg>
)
export const SparkIcon = (p: P) => (
  <Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></Svg>
)
export const CloseIcon = (p: P) => (
  <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
)
export const ChatIcon = (p: P) => (
  <Svg {...p}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z" /><path d="M8.5 8.5h7M8.5 11.5h4.5" /></Svg>
)
export const InboxIcon = (p: P) => (
  <Svg {...p}><path d="M3 13.5 5.5 5h13L21 13.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 13.5h5l1.5 2.5h5l1.5-2.5h5" /></Svg>
)
