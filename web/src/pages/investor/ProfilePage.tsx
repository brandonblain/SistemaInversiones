import { useAuth } from '../../auth/AuthContext';
import { ChangePasswordForm } from '../../components/ChangePasswordForm';
import { Card, DefinitionList, PageHeader } from '../../components/ui';

/** Datos personales de solo lectura: el MVP solo permite cambiar la contraseña. */
export function ProfilePage() {
  const { session } = useAuth();
  const p = session?.investor_profile;

  return (
    <>
      <PageHeader title="Mi perfil" />
      <div className="space-y-6">
        <Card title="Datos personales">
          <DefinitionList
            items={[
              { label: 'Nombre', value: p?.full_name ?? '—' },
              { label: 'Correo electrónico', value: session?.user.email ?? '—' },
              { label: 'Teléfono', value: p?.phone ?? '—' },
              { label: 'RFC', value: p?.rfc ?? '—' },
              ...(p?.address !== undefined ? [{ label: 'Domicilio', value: p.address ?? '—' }] : [])
            ]}
          />
          <p className="mt-4 text-sm text-ink-2">
            Para corregir cualquiera de estos datos, comuníquese con la administración. Por seguridad no se pueden modificar desde el portal.
          </p>
        </Card>
        <Card title="Cambiar contraseña">
          <ChangePasswordForm />
        </Card>
      </div>
    </>
  );
}
