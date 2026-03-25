import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Trash, Pencil, Package, ImageSquare, CircleNotch, MagnifyingGlass } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Item } from './ItemSelector'
import { Badge } from '@/components/ui/badge'

export function CatalogManagement() {
  const { user, currentCompanyId } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [catalogItems, setCatalogItems] = useState<Item[]>([])
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [itemName, setItemName] = useState('')
  const [itemDescription, setItemDescription] = useState('')
  const [itemPrice, setItemPrice] = useState('')
  const [itemStock, setItemStock] = useState('')
  const [itemImageUrl, setItemImageUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [itemImageFile, setItemImageFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (currentCompanyId) {
      loadItems()
    }
  }, [currentCompanyId])

  const loadItems = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('catalog_items')
        .select('*')
        .eq('empresa_id', currentCompanyId)
        .order('name')

      if (error) throw error

      setCatalogItems(
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
      console.error('Error fetching catalog items:', error)
      toast.error('Error al cargar catalogo')
    } finally {
      setIsLoading(false)
    }
  }

  const toDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('No se pudo leer la imagen'))
      reader.readAsDataURL(file)
    })

  const handleImageUpload = async (file: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona un archivo de imagen valido')
      return
    }

    try {
      const dataUrl = await toDataUrl(file)
      setItemImageUrl(dataUrl)
      setItemImageFile(file)
    } catch {
      toast.error('No se pudo cargar la imagen')
    }
  }

  const uploadImage = async (file: File) => {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`
    const filePath = `${currentCompanyId}/${fileName}`
    const { error: uploadError } = await supabase.storage.from('catalog-images').upload(filePath, file)
    if (uploadError) throw uploadError
    const { data: { publicUrl } } = supabase.storage.from('catalog-images').getPublicUrl(filePath)
    return publicUrl
  }

  const handleCreateItem = async () => {
    if (!currentCompanyId) {
      toast.error('Error de sesión: No se encontró la empresa.')
      return
    }
    if (!itemName.trim()) {
      toast.error('El nombre es requerido')
      return
    }
    if (itemPrice && parseFloat(itemPrice) < 0) {
      toast.error('El precio no puede ser negativo')
      return
    }
    if (itemStock && parseInt(itemStock, 10) < 0) {
      toast.error('El stock no puede ser negativo')
      return
    }

    setIsSubmitting(true)
    try {
      let finalImageUrl = itemImageUrl.trim() || null
      if (itemImageFile) {
        finalImageUrl = await uploadImage(itemImageFile)
      }

      const { data, error } = await supabase
        .from('catalog_items')
        .insert({
          empresa_id: currentCompanyId,
          name: itemName.trim(),
          description: itemDescription.trim() || null,
          unit_price: itemPrice ? parseFloat(itemPrice) : null,
          stock: itemStock ? parseInt(itemStock, 10) : null,
          image_url: finalImageUrl
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

      setCatalogItems(current => [...current, newItem])
      resetForm()
      setShowCreateDialog(false)
      toast.success('Artículo creado')
    } catch (error) {
      console.error('Error creating item:', error)
      toast.error('Error al crear el artículo')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateItem = async () => {
    if (!currentCompanyId) {
      toast.error('Error de sesión: No se encontró la empresa.')
      return
    }
    if (!editingItem || !itemName.trim()) {
      toast.error('El nombre es requerido')
      return
    }
    if (itemPrice && parseFloat(itemPrice) < 0) {
      toast.error('El precio no puede ser negativo')
      return
    }
    if (itemStock && parseInt(itemStock, 10) < 0) {
      toast.error('El stock no puede ser negativo')
      return
    }

    setIsSubmitting(true)
    try {
      let finalImageUrl = itemImageUrl.trim() || null
      if (itemImageFile) {
        finalImageUrl = await uploadImage(itemImageFile)
      }

      const { data, error } = await supabase
        .from('catalog_items')
        .update({
          name: itemName.trim(),
          description: itemDescription.trim() || null,
          unit_price: itemPrice ? parseFloat(itemPrice) : null,
          stock: itemStock ? parseInt(itemStock, 10) : null,
          image_url: finalImageUrl
        })
        .eq('id', editingItem.id)
        .eq('empresa_id', currentCompanyId)
        .select()
        .single()

      if (error) throw error

      setCatalogItems(current =>
        current.map(item =>
          item.id === editingItem.id
            ? {
                ...item,
                name: data.name,
                description: data.description || undefined,
                unitPrice: data.unit_price || undefined,
                stock: data.stock !== null ? data.stock : undefined,
                imageUrl: data.image_url || undefined
              }
            : item
        )
      )
      resetForm()
      setEditingItem(null)
      toast.success('Artículo actualizado')
    } catch (error) {
      console.error('Error updating item:', error)
      toast.error('Error al actualizar el artículo')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteItem = async (id: string) => {
    if (!currentCompanyId) return
    try {
      const { error } = await supabase
        .from('catalog_items')
        .delete()
        .eq('id', id)
        .eq('empresa_id', currentCompanyId)

      if (error) throw error

      setCatalogItems(current => current.filter(item => item.id !== id))
      toast.success('Artículo eliminado')
    } catch (error) {
      console.error('Error deleting item:', error)
      toast.error('Error al eliminar el artículo')
    }
  }

  const handleEditItem = (item: Item) => {
    setEditingItem(item)
    setItemName(item.name)
    setItemDescription(item.description || '')
    setItemPrice(item.unitPrice?.toString() || '')
    setItemStock(item.stock?.toString() || '')
    setItemImageUrl(item.imageUrl || '')
  }

  const resetForm = () => {
    setItemName('')
    setItemDescription('')
    setItemPrice('')
    setItemStock('')
    setItemImageUrl('')
    setItemImageFile(null)
  }

  const filteredItems = catalogItems.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
          <h2 className="text-xl font-semibold">Catálogo de Artículos</h2>
          <div className="relative w-full max-w-sm">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input 
              placeholder="Buscar artículos..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="pl-9" 
            />
          </div>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2" size={20} />
              Nuevo Artículo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Crear Nuevo Artículo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="item-name">Nombre *</Label>
                <Input
                  id="item-name"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="Consultoría de software"
                />
              </div>

              <div>
                <Label htmlFor="item-description">Descripcion</Label>
                <Textarea
                  id="item-description"
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  placeholder="Descripcion del producto"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="item-price">Precio Unitario</Label>
                  <Input
                    id="item-price"
                    type="number" step="0.01" min="0"
                    value={itemPrice}
                    onChange={(e) => setItemPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <Label htmlFor="item-stock">Stock</Label>
                  <Input
                    id="item-stock"
                    type="number" min="0" value={itemStock}
                    onChange={(e) => setItemStock(e.target.value)}
                    placeholder="∞"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-image-url">Imagen (URL o carga local)</Label>
                <Input
                  id="item-image-url"
                  value={itemImageUrl}
                  onChange={(e) => setItemImageUrl(e.target.value)}
                  placeholder="https://ejemplo.com/mi-producto.jpg"
                />
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e.target.files?.[0] || null)}
                />
                {itemImageUrl && (
                  <div className="rounded-lg border bg-muted/30 p-2">
                    <img
                      src={itemImageUrl}
                      alt="Vista previa"
                      className="h-28 w-full rounded object-cover"
                    />
                  </div>
                )}
              </div>

              <Button onClick={handleCreateItem} disabled={isSubmitting} className="w-full">
                {isSubmitting ? (
                  <>
                    <CircleNotch className="mr-2 animate-spin" size={20} /> Guardando...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2" size={20} />
                    Crear Artículo
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center space-y-4">
          <CircleNotch className="mx-auto animate-spin text-primary" size={40} />
          <p className="text-muted-foreground">Cargando catálogo...</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {(filteredItems || []).map((item) => (
          <Card key={item.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-1 gap-3">
                  <div className="w-24 h-24 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <ImageSquare size={32} className="text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Package size={20} className="text-muted-foreground" />
                    <h3 className="font-semibold">{item.name}</h3>
                  </div>
                  {item.description && (
                    <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                  )}
                  <div className="flex gap-2 mt-2">
                    {item.unitPrice !== undefined && (
                      <Badge variant="secondary">
                        ${item.unitPrice.toFixed(2)}
                      </Badge>
                    )}
                    {item.stock !== undefined && (
                      <Badge variant={item.stock > 0 ? 'default' : 'destructive'} className={item.stock > 0 ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 shadow-none' : ''}>
                        {item.stock > 0 ? `${item.stock} en stock` : 'Agotado'}
                      </Badge>
                    )}
                  </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Dialog open={editingItem?.id === item.id} onOpenChange={(open) => !open && setEditingItem(null)}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditItem(item)}
                      >
                        <Pencil size={16} />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Editar Artículo</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="edit-item-name">Nombre *</Label>
                          <Input
                            id="edit-item-name"
                            value={itemName}
                            onChange={(e) => setItemName(e.target.value)}
                            placeholder="Consultoría de software"
                          />
                        </div>

                        <div>
                          <Label htmlFor="edit-item-description">Descripcion</Label>
                          <Textarea
                            id="edit-item-description"
                            value={itemDescription}
                            onChange={(e) => setItemDescription(e.target.value)}
                            placeholder="Descripcion del producto"
                            rows={3}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="edit-item-price">Precio Unitario</Label>
                            <Input
                              id="edit-item-price"
                              type="number" step="0.01" min="0"
                              value={itemPrice}
                              onChange={(e) => setItemPrice(e.target.value)}
                              placeholder="0.00"
                            />
                          </div>

                          <div>
                            <Label htmlFor="edit-item-stock">Stock</Label>
                            <Input
                              id="edit-item-stock"
                              type="number" min="0" value={itemStock}
                              onChange={(e) => setItemStock(e.target.value)}
                              placeholder="∞"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="edit-item-image-url">Imagen (URL o carga local)</Label>
                          <Input
                            id="edit-item-image-url"
                            value={itemImageUrl}
                            onChange={(e) => setItemImageUrl(e.target.value)}
                            placeholder="https://ejemplo.com/mi-producto.jpg"
                          />
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleImageUpload(e.target.files?.[0] || null)}
                          />
                          {itemImageUrl && (
                            <div className="rounded-lg border bg-muted/30 p-2">
                              <img
                                src={itemImageUrl}
                                alt="Vista previa"
                                className="h-28 w-full rounded object-cover"
                              />
                            </div>
                          )}
                        </div>

                        <Button onClick={handleUpdateItem} disabled={isSubmitting} className="w-full">
                          {isSubmitting ? (
                            <>
                              <CircleNotch className="mr-2 animate-spin" size={20} /> Guardando...
                            </>
                          ) : (
                            'Actualizar Artículo'
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteItem(item.id)}
                  >
                    <Trash size={16} />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {(filteredItems || []).length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-2">
              <Package size={48} className="mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">{searchTerm ? 'No se encontraron artículos.' : 'No hay artículos en tu catálogo'}</p>
              <p className="text-sm text-muted-foreground">Agrega productos con imagen, precio y descripcion</p>
            </div>
          </CardContent>
        </Card>
      )}
        </>
      )}
    </div>
  )
}
