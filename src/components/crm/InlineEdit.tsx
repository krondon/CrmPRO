import { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PencilSimple, Check, X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface InlineEditProps {
  value: string | number
  onSave: (value: string | number) => void
  type?: 'text' | 'email' | 'number' | 'tel' | 'textarea'
  className?: string
  displayClassName?: string
  prefix?: string
  suffix?: string
  multiline?: boolean
  disabled?: boolean
  min?: number
  max?: number
  placeholder?: string
}

export function InlineEdit({
  value,
  onSave,
  type = 'text',
  className,
  displayClassName,
  prefix = '',
  suffix = '',
  multiline = false,
  disabled = false,
  min,
  max,
  placeholder
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false)
  // Manejo seguro de valores null/undefined
  const safeValue = value ?? (type === 'number' ? 0 : '')
  const [editValue, setEditValue] = useState(safeValue.toString())
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  // Verificar si el valor está vacío
  const isEmpty = safeValue === '' || safeValue === 0 || safeValue === null || safeValue === undefined

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select()
      }
    }
  }, [isEditing])

  const handleSave = () => {
    const finalValue = type === 'number' ? Number(editValue) : editValue
    if (type === 'number' && min !== undefined && Number(finalValue) < min) {
      return // Do not save if below min
    }
    if (type === 'number' && max !== undefined && Number(finalValue) > max) {
      return // Do not save if above max
    }
    if (finalValue !== value) {
      onSave(finalValue)
    }
    setIsEditing(false)
  }


  const handleCancel = () => {
    setEditValue((value ?? (type === 'number' ? 0 : '')).toString())
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  if (!isEditing) {
    return (
      <div
        className={cn(
          'group inline-flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1 -mx-2 -my-1 transition-colors',
          displayClassName,
          disabled && "cursor-default hover:bg-transparent"
        )}
        onClick={() => !disabled && setIsEditing(true)}
      >
        {isEmpty && placeholder ? (
          <span className="text-muted-foreground italic">
            {placeholder}
          </span>
        ) : (
          <span>
            {prefix}{safeValue}{suffix}
          </span>
        )}
        {!disabled && (
          <PencilSimple
            size={14}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground"
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {multiline ? (
        <Textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn('min-h-[60px]', className)}
        />
      ) : (
        <Input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={type}
          min={min}
          max={max}
          value={editValue}
          placeholder={placeholder}
          onChange={(e) => {
            const newValue = e.target.value

            if (type === 'number') {
              const val = parseFloat(newValue)
              if (!isNaN(val)) {
                if (min !== undefined && val < min) return
                if (max !== undefined && val > max) return
              }
            }

            if (type === 'tel') {
              // Permitir solo números, +, espacios, guiones y paréntesis
              if (newValue && !/^[\d\+\-\s\(\)]*$/.test(newValue)) {
                return // Ignora el cambio si contiene letras u otros caracteres
              }
            }

            setEditValue(newValue)
          }}
          onKeyDown={handleKeyDown}
          className={className}
        />
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-8 w-8 p-0 text-success hover:text-success"
        onClick={handleSave}
      >
        <Check size={16} />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
        onClick={handleCancel}
      >
        <X size={16} />
      </Button>
    </div>
  )
}
