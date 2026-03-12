-- ============================================================
-- FIX DEFINITIVO: RLS para automation_rules
-- El propietario de la empresa se identifica por empresa.usuario_id
-- pero puede no estar en empresa_miembros.
-- Este script corrige los permisos de INSERT/UPDATE/DELETE.
-- ============================================================

-- Eliminar políticas anteriores (todas)
DROP POLICY IF EXISTS "empresa_members_read_rules" ON automation_rules;
DROP POLICY IF EXISTS "empresa_admins_manage_rules" ON automation_rules;
DROP POLICY IF EXISTS "service_role_insert_rules" ON automation_rules;

-- 1. Lectura: miembros + propietario de la empresa
CREATE POLICY "read_automation_rules" ON automation_rules
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid()
    )
    OR
    empresa_id IN (
      SELECT id FROM empresa WHERE usuario_id = auth.uid()
    )
  );

-- 2. Insertar: admins/owners en empresa_miembros + propietario de la empresa
CREATE POLICY "insert_automation_rules" ON automation_rules
  FOR INSERT WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM empresa_miembros
      WHERE usuario_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR
    empresa_id IN (
      SELECT id FROM empresa WHERE usuario_id = auth.uid()
    )
  );

-- 3. Actualizar: misma condición
CREATE POLICY "update_automation_rules" ON automation_rules
  FOR UPDATE USING (
    empresa_id IN (
      SELECT empresa_id FROM empresa_miembros
      WHERE usuario_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR
    empresa_id IN (
      SELECT id FROM empresa WHERE usuario_id = auth.uid()
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM empresa_miembros
      WHERE usuario_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR
    empresa_id IN (
      SELECT id FROM empresa WHERE usuario_id = auth.uid()
    )
  );

-- 4. Eliminar: misma condición
CREATE POLICY "delete_automation_rules" ON automation_rules
  FOR DELETE USING (
    empresa_id IN (
      SELECT empresa_id FROM empresa_miembros
      WHERE usuario_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR
    empresa_id IN (
      SELECT id FROM empresa WHERE usuario_id = auth.uid()
    )
  );
