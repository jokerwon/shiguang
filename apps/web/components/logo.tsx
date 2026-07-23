import { cn } from '@/lib/utils'

export function LogoIcon({ className, background = false, style, ...props }: React.SVGProps<SVGSVGElement> & { background?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      role="img"
      aria-label="食光 Shiguang"
      className={cn('size-6', className)}
      style={
        {
          '--logo-bg': '#000300',
          '--logo-accent': '#c1fe03',
          '--logo-knob': '#ffe700',
          ...style,
        } as React.CSSProperties
      }
      {...props}
    >
      {background && <rect width="128" height="128" rx="26" fill="var(--logo-bg)" />}
      <circle cx="64" cy="64" r="33" fill="none" stroke="var(--logo-accent)" strokeWidth="7" />
      <path d="M64 64 L84.8 52" fill="none" stroke="var(--logo-accent)" strokeWidth="7" strokeLinecap="round" />
      <path d="M64 64 L49.3 55.5" fill="none" stroke="var(--logo-accent)" strokeWidth="7" strokeLinecap="round" />
      <circle cx="64" cy="64" r="6.5" fill="var(--logo-knob)" />
    </svg>
  )
}

export default LogoIcon
