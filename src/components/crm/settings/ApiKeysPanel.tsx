import { useState, useEffect } from 'react'
import { supabase } from '@/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Key, Plus, Trash, Copy, Check, Eye, EyeSlash, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  scopes: string[]
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}

interface Props {
  empresaId: string
}

const SCOPE_LABELS: Record<string, string> = {
  read:    'Lectura',
  write:   'Escritura',
  reports: 'Reportes',
}

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return 'mk_live_' + Array.from(arr).map(b => chars[b % chars.length]).join('')
}

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function ApiKeysPanel({ empresaId }: Props) {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['read'])
  const [newKeyExpires, setNewKeyExpires] = useState('')
  const [creating, setCreating] = useState(false)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    if (!empresaId) return
    loadKeys()
  }, [empresaId])

  async function loadKeys() {
    setLoading(true)
    const { data, error } = await supabase
      .from('empresa_api_keys')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
    if (error) {
      toast.error('Error al cargar las API keys')
    } else {
      setKeys(data ?? [])
    }
    setLoading(false)
  }

  async function handleCreate() {
    if (!newKeyName.trim()) {
      toast.error('Ingresa un nombre para la key')
      return
    }
    if (newKeyScopes.length === 0) {
      toast.error('Selecciona al menos un scope')
      return
    }
    setCreating(true)
    try {
      const rawKey = generateApiKey()
      const hash   = await hashKey(rawKey)
      const prefix = rawKey.slice(0, 16)

      const { error } = await supabase.from('empresa_api_keys').insert({
        empresa_id: empresaId,
        key_hash:   hash,
        key_prefix: prefix,
        name:       newKeyName.trim(),
        scopes:     newKeyScopes,
        expires_at: newKeyExpires || null,
      })

      if (error) throw error

      setRevealedKey(rawKey)
      setNewKeyName('')
      setNewKeyScopes(['read'])
      setNewKeyExpires('')
      setShowCreate(false)
      loadKeys()
    } catch (e: any) {
      toast.error('Error al crear la key: ' + e.message)
    }
    setCreating(false)
  }

  async function handleRevoke(id: string) {
    const { error } = await supabase
      .from('empresa_api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('empresa_id', empresaId)
    if (error) {
      toast.error('Error al revocar la key')
    } else {
      toast.success('API key revocada')
      loadKeys()
    }
  }

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function toggleScope(scope: string) {
    setNewKeyScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    )
  }

  const activeKeys  = keys.filter(k => !k.revoked_at)
  const revokedKeys = keys.filter(k =>  k.revoked_at)

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-violet-500/5 to-transparent pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <Key size={20} weight="duotone" className="text-violet-600" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold">API Keys</CardTitle>
                <CardDescription className="text-xs">
                  Genera keys para conectar tu CRM con asistentes de IA vía <code className="font-mono bg-muted px-1 rounded">@morna-studio/crm-mcp</code>
                </CardDescription>
              </div>
            </div>
            <Button
              size="sm"
              className="rounded-xl gap-2"
              onClick={() => setShowCreate(true)}
            >
              <Plus size={14} weight="bold" />
              Nueva Key
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Cargando...</p>
          ) : activeKeys.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Key size={32} className="mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No tienes API keys activas</p>
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setShowCreate(true)}>
                Crear tu primera key
              </Button>
            </div>
          ) : (
            activeKeys.map(key => (
              <KeyRow
                key={key.id}
                apiKey={key}
                copiedId={copiedId}
                onCopy={handleCopy}
                onRevoke={handleRevoke}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Revoked keys (collapsed) */}
      {revokedKeys.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Keys revocadas ({revokedKeys.length})
          </p>
          {revokedKeys.map(key => (
            <KeyRow key={key.id} apiKey={key} copiedId={copiedId} onCopy={handleCopy} onRevoke={(_id) => {}} revoked />
          ))}
        </div>
      )}

      {/* Config instructions */}
      <Card className="border border-dashed border-border/60 bg-muted/20 rounded-2xl">
        <CardContent className="pt-5 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cómo conectar tu asistente de IA</p>
          <pre className="text-xs bg-background rounded-xl p-4 border border-border/40 overflow-x-auto leading-relaxed">{`{
  "mcpServers": {
    "mi-crm": {
      "command": "npx",
      "args": ["-y", "@morna-studio/crm-mcp"],
      "env": {
        "MORNA_EMPRESA_ID": "${empresaId}",
        "MORNA_API_KEY": "mk_live_..."
      }
    }
  }
}`}</pre>
          <p className="text-xs text-muted-foreground">
            Reemplaza <code className="font-mono bg-muted px-1 rounded">mk_live_...</code> con tu API key generada arriba.
          </p>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva API Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Nombre</Label>
              <Input
                placeholder="Ej: Integración IA de ventas"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Permisos (scopes)</Label>
              {Object.entries(SCOPE_LABELS).map(([scope, label]) => (
                <div key={scope} className="flex items-center gap-2.5">
                  <Checkbox
                    id={`scope-${scope}`}
                    checked={newKeyScopes.includes(scope)}
                    onCheckedChange={() => toggleScope(scope)}
                  />
                  <Label htmlFor={`scope-${scope}`} className="text-sm cursor-pointer">
                    <span className="font-semibold">{label}</span>
                    <span className="text-muted-foreground ml-1.5 font-mono text-xs">{scope}</span>
                  </Label>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Vence el <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input
                type="date"
                value={newKeyExpires}
                onChange={e => setNewKeyExpires(e.target.value ? new Date(e.target.value).toISOString() : '')}
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating} className="rounded-xl">
              {creating ? 'Creando...' : 'Crear key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revealed key dialog — shown once */}
      <Dialog open={!!revealedKey} onOpenChange={() => setRevealedKey(null)}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Warning size={20} className="text-amber-500" weight="duotone" />
              Guarda tu API key ahora
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Esta es la única vez que verás esta key completa. No la guardamos en texto plano.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-xs bg-muted rounded-xl px-4 py-3 break-all border border-border/40">
                {revealedKey}
              </code>
              <Button
                size="icon"
                variant="outline"
                className="rounded-xl shrink-0"
                onClick={() => handleCopy(revealedKey!, 'revealed')}
              >
                {copiedId === 'revealed' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button className="rounded-xl w-full" onClick={() => setRevealedKey(null)}>
              Ya la guardé, cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function KeyRow({
  apiKey,
  copiedId,
  onCopy,
  onRevoke,
  revoked = false,
}: {
  apiKey: ApiKey
  copiedId: string | null
  onCopy: (text: string, id: string) => void
  onRevoke: (id: string) => void | Promise<void>
  revoked?: boolean
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${revoked ? 'opacity-50 bg-muted/30 border-border/30' : 'bg-background border-border/40 hover:border-border/70'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">{apiKey.name}</span>
          {apiKey.scopes.map(s => (
            <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
              {s}
            </Badge>
          ))}
          {revoked && <Badge variant="destructive" className="text-[10px]">Revocada</Badge>}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <code className="text-xs text-muted-foreground font-mono">{apiKey.key_prefix}...</code>
          {apiKey.last_used_at && (
            <span className="text-[10px] text-muted-foreground">
              Usado {new Date(apiKey.last_used_at).toLocaleDateString()}
            </span>
          )}
          {!apiKey.last_used_at && (
            <span className="text-[10px] text-muted-foreground">Nunca usado</span>
          )}
        </div>
      </div>

      {!revoked && (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-lg"
            onClick={() => onCopy(apiKey.id, apiKey.id)}
            title="Copiar ID de la key"
          >
            {copiedId === apiKey.id ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
          </Button>
          {!confirming ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
              onClick={() => setConfirming(true)}
              title="Revocar key"
            >
              <Trash size={13} />
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="destructive" className="h-7 text-xs rounded-lg px-2" onClick={() => { onRevoke(apiKey.id); setConfirming(false) }}>
                Revocar
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs rounded-lg px-2" onClick={() => setConfirming(false)}>
                No
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
