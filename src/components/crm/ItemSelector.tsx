import { useState, useRef, useEffect } from 'react'
import { Check, Plus, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'

export interface Item {
  id: string
  name: string
  description?: string
  unitPrice?: number
  stock?: number
  imageUrl?: string
}

interface ItemSelectorProps {
  items?: Item[]
  value?: Item
  onSelect: (item: Item) => void
  onCreate?: (item: Item) => void
  label?: string
  placeholder?: string
  className?: string
}

export function ItemSelector({ 
  items: externalItems, 
  value, 
  onSelect, 
  onCreate, 
  label, 
  placeholder = 'Seleccionar artículo...',
  className 
}: ItemSelectorProps) {
  const { user, currentCompanyId } = useAuth()
  const [internalItems, setInternalItems] = useState<Item[]>([])
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')
  const [newItemStock, setNewItemStock] = useState('')
  const [newItemDescription, setNewItemDescription] = useState('')

  useEffect(() => {
    if (currentCompanyId) {
      loadItems()
    }
  }, [currentCompanyId])

  const loadItems = async () => {
    try {
      const { data, error } = await supabase
        .from('catalog_items')
        .select('*')
        .eq('empresa_id', currentCompanyId)
        .order('name')

      if (error) throw error

      setInternalItems(
        data.map(d => ({
          id: d.id,
          name: d.name,
          description: d.description || undefined,
          unitPrice: d.unit_price || undefined,
          stock: d.stock !== null ? d.stock : undefined,
          imageUrl: d.image_url || undefined
        }))
      )
    } catch (error) {
      console.error('Error fetching items for selector:', error)
    }
  }

  const activeItems = externalItems?.length ? externalItems : internalItems

  const filteredItems = activeItems.filter(item => 
    item.name.toLowerCase().includes(searchValue.toLowerCase())
  )

  const handleCreate = async () => {
    if (!newItemName.trim() || !currentCompanyId) return

    try {
      const { data, error } = await supabase
        .from('catalog_items')
        .insert({
          empresa_id: currentCompanyId,
          name: newItemName.trim(),
          description: newItemDescription.trim() || null,
          unit_price: newItemPrice ? parseFloat(newItemPrice) : null,
          stock: newItemStock ? parseInt(newItemStock, 10) : null
        })
        .select()
        .single()

      if (error) throw error

      const newItem: Item = {
        id: data.id,
        name: data.name,
        description: data.description || undefined,
        unitPrice: data.unit_price || undefined,
          stock: data.stock !== null ? data.stock : undefined,
        imageUrl: data.image_url || undefined
      }

      setInternalItems(current => [...current, newItem])
      
      if (onCreate) {
        onCreate(newItem)
      }
      
      onSelect(newItem)
      setIsCreating(false)
      setNewItemName('')
      setNewItemPrice('')
      setNewItemStock('')
      setNewItemDescription('')
      setOpen(false)
      toast.success('Articulo creado')
    } catch (error) {
      console.error('Error creating item in selector:', error)
      toast.error('Error al crear articulo')
    }
  }

  const handleSelectItem = (item: Item) => {
    onSelect(item)
    setOpen(false)
  }
  return (
    <div className={cn('space-y-2', className)}>
      {label && <Label>{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {value ? value.name : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          {!isCreating ? (
            <Command>
              <CommandInput 
                placeholder="Buscar artículo..." 
                value={searchValue}
                onValueChange={setSearchValue}
              />
              <CommandList>
                <CommandEmpty>
                  <div className="py-6 text-center space-y-3">
                    <p className="text-sm text-muted-foreground">No se encontró el artículo</p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setIsCreating(true)
                        setNewItemName(searchValue)
                      }}
                    >
                      <Plus className="mr-2" size={16} />
                      Crear "{searchValue}"
                    </Button>
                  </div>
                </CommandEmpty>
                <CommandGroup>
                  {filteredItems.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.name}
                      onSelect={() => handleSelectItem(item)}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex-1">
                          <div className="font-medium">{item.name}</div>
                          {item.description && (
                            <div className="text-xs text-muted-foreground">{item.description}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          {item.stock !== undefined && (
                            <div className={cn(
                              "text-xs px-2 py-0.5 rounded-full",
                              item.stock > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"
                            )}>
                              {item.stock > 0 ? `${item.stock}` : 'Agotado'}
                            </div>
                          )}
                          {item.unitPrice !== undefined && (
                            <div className="text-sm font-medium">
                              ${item.unitPrice.toFixed(2)}
                            </div>
                          )}
                        </div>
                        {value?.id === item.id && (
                          <Check className="ml-2" size={16} />
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
              <div className="border-t p-2">
                <Button 
                  variant="ghost" 
                  className="w-full justify-start"
                  onClick={() => setIsCreating(true)}
                >
                  <Plus className="mr-2" size={16} />
                  Crear nuevo artículo
                </Button>
              </div>
            </Command>
          ) : (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Crear Nuevo Artículo</h3>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setIsCreating(false)
                    setNewItemName('')
                    setNewItemPrice('')
                    setNewItemStock('')
                    setNewItemDescription('')
                  }}
                >
                  <X size={16} />
                </Button>
              </div>
              
              <div className="space-y-3">
                <div>
                  <Label htmlFor="new-item-name">Nombre *</Label>
                  <Input
                    id="new-item-name"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="Nombre del artículo"
                    autoFocus
                  />
                </div>
                
                <div>
                  <Label htmlFor="new-item-description">Descripción</Label>
                  <Input
                    id="new-item-description"
                    value={newItemDescription}
                    onChange={(e) => setNewItemDescription(e.target.value)}
                    placeholder="Descripción opcional"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="new-item-price">Precio Unitario</Label>
                    <Input
                      id="new-item-price"
                      type="number"
                      step="0.01"
                      value={newItemPrice}
                      onChange={(e) => setNewItemPrice(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <Label htmlFor="new-item-stock">Stock</Label>
                    <Input
                      id="new-item-stock"
                      type="number"
                      value={newItemStock}
                      onChange={(e) => setNewItemStock(e.target.value)}
                      placeholder="∞"
                    />
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    onClick={handleCreate} 
                    className="flex-1"
                    disabled={!newItemName.trim()}
                  >
                    <Plus className="mr-2" size={16} />
                    Crear
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setIsCreating(false)
                      setNewItemName('')
                      setNewItemPrice('')
                      setNewItemStock('')
                      setNewItemDescription('')
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
