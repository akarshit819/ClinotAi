import { useId } from "react"
import { cn } from "@/lib/utils"

interface FormFieldProps {
  label: string
  error?: string | null
  hint?: string
  required?: boolean
  children: (id: string, describedBy: string | undefined) => React.ReactNode
}

/**
 * Consistent form row: label + required marker + control + hint/error.
 * Render-prop gives the caller control over the input element while the
 * label/error wiring stays uniform (a11y: htmlFor + aria-describedby).
 */
export function FormField({ label, error, hint, required, children }: FormFieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-navy-600 dark:text-navy-300">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-danger-500">
            *
          </span>
        )}
      </label>
      {children(id, describedBy)}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs leading-relaxed text-navy-400 dark:text-navy-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium leading-relaxed text-danger-600 dark:text-danger-400">
          {error}
        </p>
      )}
    </div>
  )
}

const inputClassName =
  "input-field aria-[invalid=true]:border-danger-400 aria-[invalid=true]:focus:border-danger-500 aria-[invalid=true]:focus:ring-danger-500/20"

export function TextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClassName, className)} />
}

export function TextArea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClassName, "min-h-[96px] resize-y", className)} />
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(inputClassName, "appearance-none pr-10", className)}>
      {children}
    </select>
  )
}
