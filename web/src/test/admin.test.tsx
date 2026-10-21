import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { api } from '../api';
import { ADMIN_ID, renderApp } from './render';

describe('Administración', () => {
  it('formulario de contrato valida fechas y pide revisión antes de guardar', async () => {
    const user = userEvent.setup();
    renderApp('/admin/inversiones/nueva', { loginAs: ADMIN_ID });
    await user.selectOptions(await screen.findByLabelText('Cliente'), 'usr_fict_02');
    await user.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(screen.getByText('Seleccione el giro del contrato.')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Vehículos extranjeros/ }));
    await user.type(screen.getByLabelText('Código de contrato'), 'FICT-TEST-01');
    await user.type(screen.getByLabelText('Capital (MXN)'), '250,000.00');
    await user.type(screen.getByLabelText('Tasa anual fija (%)'), '12.5');
    expect(screen.getByText(/Se registrará: \$250,000.00 MXN/)).toBeInTheDocument();
    expect(screen.getByText(/12.50 % anual \(1250 pb\)/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Fecha de inicio'), '2026-06-01');
    await user.type(screen.getByLabelText('Fecha de vencimiento'), '2026-05-01');
    await user.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(screen.getByText('Debe ser posterior a la fecha de inicio.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Fecha de vencimiento'));
    await user.type(screen.getByLabelText('Fecha de vencimiento'), '2027-06-01');
    await user.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(screen.getByText('Revise antes de guardar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar y guardar' }));
    expect(await screen.findByText('FICT-TEST-01')).toBeInTheDocument();
    expect(screen.getAllByText('Vehículos extranjeros legalizados').length).toBeGreaterThan(0);
  });

  it('nuevo cliente con beneficiarios: los porcentajes deben sumar 100 %', async () => {
    const user = userEvent.setup();
    renderApp('/admin/clientes/nuevo', { loginAs: ADMIN_ID });
    await user.type(await screen.findByLabelText('Nombre completo'), 'Cliente FICTICIO Prueba');
    await user.type(screen.getByLabelText('Correo electrónico (usuario)'), 'cliente.prueba@ficticio.test');
    await user.type(screen.getByLabelText('Contraseña temporal'), 'Temporal2026');
    await user.type(screen.getByLabelText('Confirmar contraseña temporal'), 'Temporal2026');

    await user.click(screen.getByRole('button', { name: 'Agregar beneficiario' }));
    await user.type(screen.getByLabelText('Nombre del beneficiario 1'), 'Beneficiaria FICTICIA Uno');
    await user.selectOptions(screen.getByLabelText('Parentesco'), 'SPOUSE');
    await user.type(screen.getByLabelText('Porcentaje (%)'), '70');
    expect(screen.getByText('Total: 70.00 % de 100 %')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Crear cliente' }));
    expect(await screen.findByText(/suman 70.00 %; deben sumar 100 %/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Agregar beneficiario' }));
    await user.type(screen.getByLabelText('Nombre del beneficiario 2'), 'Beneficiario FICTICIO Dos');
    await user.selectOptions(screen.getAllByLabelText('Parentesco')[1]!, 'CHILD');
    await user.type(screen.getAllByLabelText('Porcentaje (%)')[1]!, '30');
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }));

    expect(await screen.findByRole('heading', { name: 'Cliente FICTICIO Prueba' })).toBeInTheDocument();
    expect(screen.getAllByText('Beneficiaria FICTICIA Uno').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cónyuge').length).toBeGreaterThan(0);
    expect(screen.getAllByText('30.00 %').length).toBeGreaterThan(0);
  });

  it('el administrador sube un documento desde el gestor', async () => {
    const user = userEvent.setup();
    renderApp('/admin/documentos', { loginAs: ADMIN_ID });
    await user.click(await screen.findByRole('button', { name: 'Subir documento' }));
    await user.selectOptions(await screen.findByLabelText('Contrato'), 'inv_fict_005');
    await user.upload(screen.getByLabelText(/Archivo \(PDF/), new File(['%PDF-1.4'], 'Pagare_FICTICIO.pdf', { type: 'application/pdf' }));
    expect(screen.getByLabelText('Título del documento')).toHaveValue('Pagare FICTICIO');
    await user.click(screen.getByRole('button', { name: 'Guardar documento' }));
    expect(await screen.findByText('Documento “Pagare FICTICIO” guardado.')).toBeInTheDocument();
    expect((await screen.findAllByText('Pagare FICTICIO')).length).toBeGreaterThan(0);
  });

  it('vista previa marcada como proyección; doble clic en confirmar no duplica', async () => {
    const user = userEvent.setup();
    renderApp('/admin/rendimientos?inversion=inv_fict_001', { loginAs: ADMIN_ID });
    // Hay dos formularios con periodo (cálculo y ajuste manual); el primero es el de cálculo.
    await user.type((await screen.findAllByLabelText('Inicio del periodo'))[0]!, '2026-09-15');
    await user.type(screen.getAllByLabelText(/Fin del periodo/)[0]!, '2026-10-15');
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
    expect(await screen.findByText('Proyección · aún no confirmada')).toBeInTheDocument();

    const before = (await api.admin.yields('inv_fict_001')).length;
    const confirm = screen.getByRole('button', { name: 'Confirmar rendimiento' });
    await user.dblClick(confirm);
    expect(await screen.findByText(/Rendimiento confirmado por/)).toBeInTheDocument();
    expect((await api.admin.yields('inv_fict_001')).length).toBe(before + 1);
  });

  it('no permite asignar a un rendimiento más que su saldo pendiente', async () => {
    const user = userEvent.setup();
    renderApp('/admin/pagos?inversion=inv_fict_004', { loginAs: ADMIN_ID });
    const pendingEntries = await api.admin.yields('inv_fict_004', { pendingOnly: true });
    expect(pendingEntries.length).toBeGreaterThan(0);

    await user.type(await screen.findByLabelText('Monto pagado (MXN)'), '999,999.00');
    await user.type(screen.getByLabelText('Referencia bancaria'), 'FICTICIO-TEST');
    const allocInputs = await screen.findAllByLabelText('Importe a asignar');
    await user.type(allocInputs[0]!, '999,999.00');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Registrar pago confirmado' }));
    expect(await screen.findByText(/excede su saldo pendiente/)).toBeInTheDocument();
  });

  it('exige confirmar que el pago externo ya se realizó', async () => {
    const user = userEvent.setup();
    renderApp('/admin/pagos?inversion=inv_fict_004', { loginAs: ADMIN_ID });
    await user.type(await screen.findByLabelText('Monto pagado (MXN)'), '100.00');
    await user.type(screen.getByLabelText('Referencia bancaria'), 'FICTICIO-TEST');
    await user.click(screen.getByRole('button', { name: 'Registrar pago confirmado' }));
    expect(await screen.findByText('Confirme que el pago externo ya se realizó.')).toBeInTheDocument();
  });

  it('rechaza documentos con tipo no permitido antes de subirlos', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderApp('/admin/documentos?inversion=inv_fict_001', { loginAs: ADMIN_ID });
    const input = await screen.findByLabelText(/Archivo \(PDF/);
    await user.upload(input, new File(['x'], 'malicioso.exe', { type: 'application/x-msdownload' }));
    expect(screen.getByText('Solo se admiten archivos PDF, PNG o JPEG.')).toBeInTheDocument();
  });

  it('bitácora paginada y filtrable', async () => {
    const user = userEvent.setup();
    renderApp('/admin/bitacora', { loginAs: ADMIN_ID });
    expect((await screen.findAllByText('INVESTMENT_CREATED')).length).toBeGreaterThan(0);
    await user.type(screen.getByLabelText('Filtrar por acción'), 'PAYMENT');
    await waitFor(() => expect(screen.queryByText('INVESTMENT_CREATED')).not.toBeInTheDocument());
    expect(screen.getAllByText('EXTERNAL_PAYMENT_RECORDED').length).toBeGreaterThan(0);
  });
});

