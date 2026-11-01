export function Logo({ className = "h-7" }: { className?: string }) {
  return <img src="/logo.png" alt="EdoDoc" className={`${className} w-auto object-contain`} />
}
