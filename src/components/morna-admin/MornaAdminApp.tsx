import { Routes, Route } from 'react-router-dom'
import { MornaAdminLayout } from './MornaAdminLayout'
import { CompaniesView } from './CompaniesView'
import { StaffView } from './StaffView'
import { AuditView } from './AuditView'

/**
 * Sub-router del panel Morna. Se monta bajo /morna-admin/*.
 *   - index → Empresas (PR 1)
 *   - /staff → Gestión de staff (PR 3)
 *   - /audit → Auditoría (PR 3)
 */
export function MornaAdminApp() {
    return (
        <MornaAdminLayout>
            <Routes>
                <Route index element={<CompaniesView />} />
                <Route path="staff" element={<StaffView />} />
                <Route path="audit" element={<AuditView />} />
            </Routes>
        </MornaAdminLayout>
    )
}
