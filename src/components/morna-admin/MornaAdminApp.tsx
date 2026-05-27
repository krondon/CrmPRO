import { Routes, Route } from 'react-router-dom'
import { MornaAdminLayout } from './MornaAdminLayout'
import { CompaniesView } from './CompaniesView'

/**
 * Sub-router del panel Morna. Se monta bajo /morna-admin/*.
 *
 * Las rutas /staff y /audit son placeholders por ahora — se implementan en
 * el PR 3 (acciones admin). Mantenerlas reservadas evita romper el menú.
 */
export function MornaAdminApp() {
    return (
        <MornaAdminLayout>
            <Routes>
                <Route index element={<CompaniesView />} />
                <Route path="staff" element={<PlaceholderView title="Staff Morna" />} />
                <Route path="audit" element={<PlaceholderView title="Auditoría" />} />
            </Routes>
        </MornaAdminLayout>
    )
}

function PlaceholderView({ title }: { title: string }) {
    return (
        <div className="p-6">
            <h1 className="text-2xl font-black tracking-tight">{title}</h1>
            <p className="text-sm text-zinc-400 mt-1">Esta sección se implementa en el PR 3.</p>
        </div>
    )
}
