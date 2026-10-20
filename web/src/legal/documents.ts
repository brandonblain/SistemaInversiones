// Documentos legales del sitio (Pimex Fortex Capital).
//
// BORRADORES para revisión de un abogado: los textos entre [CORCHETES] son datos por completar o decisiones
// por confirmar y se resaltan en pantalla. Mientras DRAFT sea true, cada página muestra el aviso de borrador.
//
// Nota de vigencia: el 20/03/2025 se publicó una nueva Ley Federal de Protección de Datos Personales en
// Posesión de los Particulares (LFPDPPP) y las funciones del INAI pasaron a la Secretaría Anticorrupción y
// Buen Gobierno. Por eso los textos evitan citar artículos de la ley anterior; el abogado debe confirmarlos.

export const DRAFT = true;

export type Block =
  | string
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { callout: string };

export interface LegalSection {
  title: string;
  blocks: Block[];
}

export interface LegalDoc {
  slug: string;
  title: string;
  /** Nombre corto para menús y pies de página. */
  short: string;
  summary: string;
  group: 'sitio' | 'inversionistas';
  sections: LegalSection[];
}

const EMPRESA = '[RAZÓN SOCIAL: Pimex Fortex Capital, S.A.P.I. de C.V. — confirmar denominación y figura legal]';
const DOMICILIO = '[DOMICILIO: calle, número, colonia, código postal, ciudad, estado, México]';
const CORREO_PRIVACIDAD = '[privacidad@pimexfortexcapital.com.mx]';
const CORREO_SOPORTE = '[atencion@pimexfortexcapital.com.mx]';
const TELEFONO = '[TELÉFONO DE ATENCIÓN]';
const CIUDAD = '[CIUDAD, ESTADO]';
const SITIO = 'https://pimexfortexcapital.com.mx';
const PORTAL = 'https://clientes.pimexfortexcapital.com.mx';
const FECHA = '[FECHA DE ÚLTIMA ACTUALIZACIÓN]';

export const LEGAL_DOCS: LegalDoc[] = [
  // ---------------------------------------------------------------------------------------------------
  {
    slug: 'aviso-de-privacidad',
    title: 'Aviso de Privacidad Integral',
    short: 'Aviso de privacidad',
    summary: 'Qué datos personales recabamos, para qué los usamos y cómo ejercer sus derechos ARCO.',
    group: 'sitio',
    sections: [
      {
        title: '1. Identidad y domicilio del Responsable',
        blocks: [
          `${EMPRESA} (en adelante, "Pimex Fortex Capital" o el "Responsable"), con domicilio en ${DOMICILIO}, es responsable del tratamiento de sus datos personales conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares vigente (la "LFPDPPP"), su Reglamento y demás disposiciones aplicables.`,
          `Este Aviso aplica al sitio ${SITIO}, al portal de inversionistas ${PORTAL} y a la relación contractual con nuestros inversionistas. Última actualización: ${FECHA}.`
        ]
      },
      {
        title: '2. Datos personales que recabamos',
        blocks: [
          'Recabamos datos personales de manera directa (cuando usted nos los proporciona), por medios electrónicos (al usar el portal) y de fuentes de acceso público permitidas por la ley. Las categorías son:',
          {
            list: [
              'Datos de identificación: nombre completo, fecha de nacimiento, nacionalidad, firma, Registro Federal de Contribuyentes (RFC), Clave Única de Registro de Población (CURP) e identificación oficial vigente.',
              'Datos de contacto: domicilio, correo electrónico y número telefónico.',
              'DATOS FINANCIEROS Y PATRIMONIALES: número de cuenta bancaria y CLABE interbancaria, carátula de estado de cuenta, montos invertidos, rendimientos, pagos y reinversiones, Constancia de Situación Fiscal, comprobantes fiscales (CFDI) y origen de los recursos.',
              'Datos de beneficiarios que usted designe: nombre, parentesco y porcentaje asignado. Al proporcionarlos, usted declara contar con el consentimiento de dichas personas o, en su caso, la facultad para compartirlos.',
              'Datos técnicos de uso del portal: dirección IP, fecha y hora de acceso, navegador e intentos de inicio de sesión, con fines de seguridad.'
            ]
          },
          { callout: 'Los datos financieros y patrimoniales requieren su consentimiento expreso, que se recaba al firmar el contrato de inversión o mediante el mecanismo que el Responsable establezca. No recabamos datos personales sensibles.' }
        ]
      },
      {
        title: '3. Finalidades del tratamiento',
        blocks: [
          'Finalidades primarias (necesarias para la relación con usted):',
          {
            list: [
              'Identificarlo, verificar su identidad y abrir y administrar su cuenta en el portal de inversionistas.',
              'Formalizar, ejecutar y dar seguimiento a los contratos de inversión: registro de aportaciones, cálculo y confirmación de rendimientos, pagos, reinversiones y liquidaciones.',
              'Cumplir obligaciones fiscales, incluida la emisión de comprobantes fiscales y, en su caso, retenciones.',
              'Cumplir obligaciones de prevención e identificación de operaciones con recursos de procedencia ilícita (conocimiento del cliente, monitoreo y, cuando proceda, avisos a la autoridad).',
              'Enviarle avisos operativos de su cuenta (por ejemplo, rendimientos confirmados, pagos registrados o restablecimiento de contraseña).',
              'Atender aclaraciones, quejas y solicitudes de derechos ARCO, y proteger la seguridad del portal.'
            ]
          },
          'Finalidades secundarias (no necesarias; puede negarse):',
          { list: ['Enviarle ofertas de nuevas oportunidades de inversión.', 'Enviarle boletines informativos y análisis de mercado.'] },
          'La negativa a las finalidades secundarias no será motivo para negarle los servicios.'
        ]
      },
      {
        title: '4. Negativa y revocación del consentimiento',
        blocks: [
          `Si no desea que sus datos se traten para las finalidades secundarias, o desea revocar el consentimiento otorgado, envíe un correo a ${CORREO_PRIVACIDAD} con el asunto "Negativa / Revocación", indicando su nombre completo, el consentimiento que revoca y un medio para comunicarle la respuesta.`,
          'La revocación no tendrá efectos retroactivos ni procederá cuando el tratamiento sea necesario para cumplir obligaciones derivadas de un contrato vigente o de una disposición legal.'
        ]
      },
      {
        title: '5. Transferencias de datos',
        blocks: [
          'Pimex Fortex Capital no vende, renta ni comercializa sus datos personales. No los transferiremos a terceros, nacionales o extranjeros, sin su consentimiento previo, salvo en los supuestos de excepción que prevé la LFPDPPP, entre ellos:',
          {
            list: [
              'Requerimientos de autoridades fiscales (SAT), financieras o de prevención de lavado de dinero (UIF, CNBV) y judiciales, debidamente fundados y motivados.',
              'Cuando la transferencia sea necesaria para el cumplimiento de una obligación legal o para mantener o cumplir la relación jurídica con usted.',
              'Cuando sea necesaria para el reconocimiento, ejercicio o defensa de un derecho en un proceso judicial.'
            ]
          },
          'Utilizamos proveedores (encargados) que tratan datos por cuenta nuestra y bajo nuestras instrucciones, con obligaciones de confidencialidad: alojamiento e infraestructura en la nube (Cloudflare, Inc.) y envío de correos transaccionales (Resend). Algunos pueden almacenar información fuera de México.',
          '[Confirmar con el abogado los artículos de excepción aplicables conforme a la LFPDPPP vigente.]'
        ]
      },
      {
        title: '6. Derechos ARCO',
        blocks: [
          'Usted tiene derecho a Acceder a sus datos personales, Rectificarlos si son inexactos, Cancelarlos cuando considere que no se requieren para alguna de las finalidades y Oponerse a su tratamiento para fines específicos (derechos ARCO).',
          `Para ejercerlos, envíe su solicitud a ${CORREO_PRIVACIDAD} con:`,
          {
            list: [
              'Nombre del titular y medio para comunicarle la respuesta.',
              'Copia de su identificación oficial o, en su caso, la de su representante legal y el documento que acredite la representación.',
              'Descripción clara de los datos y del derecho que desea ejercer.',
              'Cualquier documento que facilite la localización de los datos; en caso de rectificación, la documentación que la sustente.'
            ]
          },
          'Le comunicaremos la determinación adoptada en un plazo máximo de veinte (20) días hábiles contados desde la recepción de la solicitud y, si resulta procedente, se hará efectiva dentro de los quince (15) días hábiles siguientes. Los plazos podrán ampliarse una sola vez por un periodo igual cuando lo justifiquen las circunstancias. [Confirmar plazos con la LFPDPPP vigente.]',
          'Si considera que su derecho a la protección de datos fue vulnerado, puede acudir ante la autoridad garante en la materia [actualmente, la Secretaría Anticorrupción y Buen Gobierno; confirmar].'
        ]
      },
      {
        title: '7. Cookies y tecnologías de rastreo',
        blocks: [
          'El portal usa una sola cookie técnica, indispensable para mantener su sesión iniciada de forma segura. El sitio no utiliza cookies de analítica ni de publicidad. Consulte el detalle en la Política de Cookies.'
        ]
      },
      {
        title: '8. Cambios al Aviso de Privacidad',
        blocks: [
          `Este Aviso puede modificarse por cambios legales, en nuestros servicios o en nuestras prácticas. Publicaremos la versión vigente en ${SITIO}/legal/aviso-de-privacidad con su fecha de actualización y, cuando los cambios sean relevantes, se lo notificaremos por correo electrónico o mediante un aviso en el portal.`
        ]
      }
    ]
  },

  // ---------------------------------------------------------------------------------------------------
  {
    slug: 'terminos-y-condiciones',
    title: 'Términos y Condiciones de Uso',
    short: 'Términos y condiciones',
    summary: 'Reglas para usar el sitio y el portal de inversionistas.',
    group: 'sitio',
    sections: [
      {
        title: '1. Aceptación',
        blocks: [
          `Estos Términos regulan el acceso y uso del sitio ${SITIO} y del portal ${PORTAL} (la "Plataforma"), operados por ${EMPRESA}, con domicilio en ${DOMICILIO}. Al acceder o usar la Plataforma, usted acepta estos Términos. Si no está de acuerdo, absténgase de usarla. Última actualización: ${FECHA}.`
        ]
      },
      {
        title: '2. Mayoría de edad y capacidad',
        blocks: [
          'El portal de inversionistas es exclusivo para personas mayores de dieciocho (18) años, con plena capacidad legal y con Registro Federal de Contribuyentes (RFC) mexicano vigente, así como para personas morales debidamente constituidas que actúen por conducto de sus representantes. Al usar el portal, usted declara cumplir con estos requisitos.'
        ]
      },
      {
        title: '3. Objeto de la Plataforma',
        blocks: [
          'La Plataforma tiene por objeto: (i) informar al público sobre los ramos de negocio y las condiciones de referencia de las inversiones que ofrece Pimex Fortex Capital, y (ii) permitir a los inversionistas con contrato vigente consultar en línea su capital, rendimientos, pagos y avisos.',
          'La Plataforma es un medio de consulta. No permite realizar depósitos, retiros ni transferencias; las aportaciones y los pagos se realizan fuera de ella, conforme al contrato de inversión. La información publicada es de referencia: las condiciones definitivas son las del contrato que cada inversionista firma.',
          'Los indicadores de mercado (tipos de cambio, UDIS, tasas y CETES) provienen de Banco de México y se muestran con fines informativos; no modifican saldos ni contratos.'
        ]
      },
      {
        title: '4. Cuenta de acceso',
        blocks: [
          'Las cuentas del portal las crea la administración de Pimex Fortex Capital. Usted es responsable de la confidencialidad de su contraseña y de toda actividad realizada con su cuenta. Notifique de inmediato cualquier uso no autorizado. Podremos suspender cuentas ante indicios de uso indebido o por motivos de seguridad.'
        ]
      },
      {
        title: '5. Propiedad intelectual',
        blocks: [
          'Los logotipos, marcas, nombres comerciales, diseño, código fuente, software, textos, imágenes y demás contenido de la Plataforma son propiedad de Pimex Fortex Capital o de sus licenciantes y están protegidos por la Ley Federal del Derecho de Autor, la Ley Federal de Protección a la Propiedad Industrial y los tratados aplicables. No se otorga licencia alguna salvo el uso personal y no comercial necesario para consultar la Plataforma.',
          'Algunas fotografías se usan bajo licencia de sus autores o bancos de imágenes.'
        ]
      },
      {
        title: '6. Uso aceptable',
        blocks: [
          'Queda prohibido:',
          {
            list: [
              'Extraer información de forma automatizada (scraping, robots o similares) sin autorización escrita.',
              'Realizar ingeniería inversa, descompilar o intentar obtener el código fuente.',
              'Introducir código malicioso, realizar inyecciones de código, ataques de denegación de servicio o intentar eludir las medidas de seguridad.',
              'Acceder o intentar acceder a cuentas o información de terceros, o suplantar la identidad de otra persona.',
              'Usar la Plataforma para fines ilícitos o contrarios a estos Términos.'
            ]
          },
          'El incumplimiento podrá dar lugar a la suspensión del acceso y a las acciones legales que correspondan.'
        ]
      },
      {
        title: '7. Exclusión de garantías y límite de responsabilidad',
        blocks: [
          'La Plataforma se ofrece "tal cual" y "según disponibilidad". Pimex Fortex Capital procura su funcionamiento continuo y seguro, pero no garantiza que esté libre de interrupciones o errores.',
          'En la medida permitida por la ley, Pimex Fortex Capital no será responsable por daños derivados de fallas de servidores, interrupciones técnicas, mantenimiento, fallas de proveedores de telecomunicaciones, de infraestructura en la nube o de energía ajenos a su control, ni por caso fortuito o fuerza mayor. Las cifras del portal son informativas; en caso de discrepancia, prevalecen los registros contables y el contrato.'
        ]
      },
      {
        title: '8. Enlaces a terceros y pagos externos',
        blocks: [
          'La Plataforma puede contener enlaces a sitios de terceros (por ejemplo, Banco de México o autoridades). No controlamos su contenido ni sus políticas y no somos responsables de ellos.',
          'La Plataforma no procesa pagos. Las transferencias se realizan por medios bancarios externos (por ejemplo, SPEI) bajo las condiciones de la institución correspondiente.'
        ]
      },
      {
        title: '9. Modificaciones',
        blocks: [
          'Podremos modificar estos Términos en cualquier momento. La versión vigente se publicará en esta página con su fecha de actualización; los cambios relevantes se notificarán a los inversionistas por correo electrónico o mediante un aviso en el portal. El uso posterior de la Plataforma implica la aceptación de los cambios.'
        ]
      },
      {
        title: '10. Legislación aplicable y jurisdicción',
        blocks: [
          `Estos Términos se rigen por las leyes federales de los Estados Unidos Mexicanos. Para su interpretación y cumplimiento, las partes se someten expresamente a los tribunales competentes de ${CIUDAD}, renunciando a cualquier otro fuero que pudiera corresponderles por razón de su domicilio presente o futuro o por cualquier otra causa. [Si el usuario es consumidor, confirmar con el abogado los derechos irrenunciables que le otorga la Ley Federal de Protección al Consumidor.]`
        ]
      }
    ]
  },

  // ---------------------------------------------------------------------------------------------------
  {
    slug: 'politica-de-cookies',
    title: 'Política de Cookies y Tecnologías de Seguimiento',
    short: 'Política de cookies',
    summary: 'Qué cookies usamos (solo una, técnica) y cómo administrarlas.',
    group: 'sitio',
    sections: [
      {
        title: '1. ¿Qué son las cookies y tecnologías similares?',
        blocks: [
          'Las cookies son pequeños archivos que un sitio guarda en su navegador para recordar información entre visitas. Los web beacons (píxeles) son imágenes diminutas que permiten saber si se abrió una página o un correo. Otras tecnologías similares incluyen el almacenamiento local del navegador.',
          `Esta política aplica a ${SITIO} y ${PORTAL}, operados por ${EMPRESA}. Última actualización: ${FECHA}.`
        ]
      },
      {
        title: '2. Cookies que usamos',
        blocks: [
          'Usamos únicamente una cookie técnica, indispensable para el funcionamiento seguro del portal de inversionistas. El sitio público no instala cookies.',
          {
            table: {
              head: ['Nombre', 'Proveedor', 'Tipo y propósito', 'Caducidad'],
              rows: [
                [
                  'auth_session',
                  'Pimex Fortex Capital (clientes.pimexfortexcapital.com.mx)',
                  'Técnica / esencial. Mantiene la sesión iniciada de forma segura. Es HttpOnly (no la puede leer ningún código de la página), Secure (solo viaja cifrada) y SameSite=Strict (no se envía desde otros sitios, lo que ayuda a prevenir fraudes).',
                  'Al cerrar sesión, o a las 12 horas (administración) o 7 días (inversionistas).'
                ]
              ]
            }
          },
          'No usamos cookies analíticas (medición de tráfico) ni publicitarias o de marketing (por ejemplo, retargeting de Meta o Google), ni web beacons en nuestros correos. Tampoco guardamos datos de su sesión o financieros en el almacenamiento local del navegador.',
          'Nuestro proveedor de infraestructura (Cloudflare) podría establecer cookies técnicas de seguridad (por ejemplo, para distinguir tráfico automatizado) si se activan sus protecciones contra ataques. [Confirmar si se activan y, en su caso, listarlas.]'
        ]
      },
      {
        title: '3. Si en el futuro usamos otras cookies',
        blocks: [
          'Si incorporamos cookies analíticas o publicitarias, actualizaremos esta política con su nombre, proveedor, propósito y caducidad, y solicitaremos su consentimiento antes de instalarlas mediante un aviso en el sitio. Podrá aceptarlas o rechazarlas sin afectar el uso de la Plataforma.'
        ]
      },
      {
        title: '4. Cómo configurar, deshabilitar o eliminar cookies',
        blocks: [
          {
            list: [
              'Google Chrome: Menú (⋮) › Configuración › Privacidad y seguridad › Cookies de terceros / Ver todos los datos y permisos de sitios.',
              'Safari (Mac): Safari › Configuración › Privacidad › Administrar datos de sitios web. En iPhone/iPad: Configuración › Safari › Avanzado › Datos de sitios web.',
              'Mozilla Firefox: Menú (☰) › Configuración › Privacidad y seguridad › Cookies y datos del sitio.',
              'Microsoft Edge: Menú (…) › Configuración › Cookies y permisos del sitio › Administrar y eliminar cookies y datos del sitio.'
            ]
          },
          'Las rutas pueden variar según la versión del navegador.'
        ]
      },
      {
        title: '5. Efectos de deshabilitar las cookies',
        blocks: [
          'Si bloquea la cookie auth_session, no podrá iniciar sesión ni consultar su información en el portal de inversionistas, porque es la que protege y mantiene su sesión. El sitio público seguirá funcionando con normalidad.'
        ]
      }
    ]
  },

  // ---------------------------------------------------------------------------------------------------
  {
    slug: 'contrato-marco-de-inversion',
    title: 'Contrato Marco de Inversión y Participación',
    short: 'Contrato marco de inversión',
    summary: 'Modelo de las condiciones generales que rigen cada inversión.',
    group: 'inversionistas',
    sections: [
      {
        title: 'Partes',
        blocks: [
          `CONTRATO MARCO DE INVERSIÓN Y PARTICIPACIÓN que celebran, por una parte, ${EMPRESA} (la "Empresa"), representada por [NOMBRE DEL REPRESENTANTE LEGAL], y, por la otra, [NOMBRE O DENOMINACIÓN DEL INVERSIONISTA] (el "Inversionista"), persona [física / moral], conforme a las siguientes declaraciones y cláusulas.`,
          '[Modelo de referencia. Las condiciones particulares de cada inversión (ramo, monto, tasa, plazo y modalidad de cobro) se pactan en el Anexo de Condiciones Particulares que firma cada Inversionista.]'
        ]
      },
      {
        title: 'Declaraciones',
        blocks: [
          'I. Declara la Empresa:',
          {
            list: [
              `Ser una sociedad constituida conforme a las leyes mexicanas, según consta en la escritura pública [NÚMERO], otorgada ante el notario [NÚMERO Y NOMBRE] de ${CIUDAD}, con RFC [RFC DE LA EMPRESA] y domicilio en ${DOMICILIO}.`,
              'Que su representante cuenta con facultades suficientes, que no le han sido revocadas ni limitadas.',
              '[Estatus regulatorio: precisar la figura legal con la que opera y si cuenta o no con autorización de alguna autoridad financiera.]'
            ]
          },
          'II. Declara el Inversionista, bajo protesta de decir verdad:',
          {
            list: [
              'Tener capacidad legal para obligarse en los términos de este Contrato y, en su caso, que su representante cuenta con facultades suficientes.',
              'Que los recursos que aporta son de su propiedad y provienen de fuentes lícitas, y que no actúa por cuenta de terceros.',
              'Que ha leído y comprendido la Declaración de Riesgos y que la inversión puede implicar la pérdida parcial o total del capital.'
            ]
          }
        ]
      },
      {
        title: 'Cláusula primera. Objeto',
        blocks: [
          'El Inversionista aporta recursos a la Empresa para participar en los ramos de negocio que se indiquen en el Anexo de Condiciones Particulares (transporte, movilidad, vehículos eléctricos, alimentos, CETES u otros), a cambio de los rendimientos que ahí se pacten.'
        ]
      },
      {
        title: 'Cláusula segunda. Aportación de capital',
        blocks: [
          {
            list: [
              'Monto mínimo de aportación: [MONTO MÍNIMO] en [pesos mexicanos / dólares de los Estados Unidos de América].',
              'Fondeo exclusivamente por transferencia electrónica (SPEI o transferencia internacional) desde una cuenta bancaria a nombre del propio Inversionista, a la cuenta concentradora: [BANCO], CLABE [CLABE], a nombre de la Empresa.',
              'No se aceptan depósitos en efectivo ni transferencias de cuentas de terceros.',
              'La aportación se tendrá por recibida cuando los fondos se acrediten en la cuenta concentradora; la Empresa entregará el comprobante correspondiente.'
            ]
          }
        ]
      },
      {
        title: 'Cláusula tercera. Rendimientos y pagos',
        blocks: [
          {
            list: [
              'Tasa: [PORCENTAJE] % anual fija, o variable referida a CETES a [PLAZO] días menos [NÚMERO] punto(s) porcentual(es), según el Anexo.',
              'Base de cálculo: [días naturales transcurridos / 365, u otra que se pacte].',
              'Modalidad de cobro: [mensual / semestral / anual / a la liquidación]. Fechas de corte: [DÍA DE CORTE].',
              'Los rendimientos se pagan por transferencia a la cuenta del Inversionista dentro de los [NÚMERO] días hábiles siguientes a cada fecha de corte, o se reinvierten si así se pacta.',
              'La Empresa realizará las retenciones de impuestos (incluido el ISR) que, en su caso, procedan conforme a la legislación fiscal, y emitirá los comprobantes fiscales digitales (CFDI) y constancias correspondientes. [Confirmar tratamiento fiscal con el contador.]'
            ]
          },
          'Los saldos y rendimientos se pueden consultar en el portal de inversionistas con fines informativos; en caso de discrepancia prevalecen los registros contables de la Empresa y este Contrato.'
        ]
      },
      {
        title: 'Cláusula cuarta. Plazo, permanencia y retiros anticipados',
        blocks: [
          {
            list: [
              'Plazo de la inversión: [NÚMERO] meses a partir de la fecha de aportación.',
              'Periodo de permanencia obligatoria (lock-up): [NÚMERO] meses, durante los cuales no procede el retiro del capital.',
              'Retiro anticipado posterior al lock-up: mediante solicitud por escrito con [NÚMERO] días de anticipación, con una penalización de [PORCENTAJE] % sobre [el capital / los rendimientos], o las restricciones que se indiquen en el Anexo.',
              'Al vencimiento, el capital se devolverá dentro de los [NÚMERO] días hábiles siguientes, salvo que las partes acuerden su renovación por escrito.'
            ]
          }
        ]
      },
      {
        title: 'Cláusula quinta. Rescisión y liquidación anticipada',
        blocks: [
          'Serán causas de rescisión, sin necesidad de declaración judicial:',
          {
            list: [
              'La falsedad de las declaraciones del Inversionista, incluida la relativa al origen lícito de los recursos.',
              'El incumplimiento de las obligaciones de conocimiento del cliente o la existencia de alertas de autoridad competente.',
              'El incumplimiento grave de cualquiera de las obligaciones de las partes.'
            ]
          },
          'En caso de rescisión o liquidación forzosa, la Empresa devolverá el capital y los rendimientos devengados hasta la fecha de terminación, en los plazos y con las deducciones previstas en [CONDICIONES], salvo que una autoridad ordene lo contrario.'
        ]
      },
      {
        title: 'Cláusula sexta. Aceptación por medios electrónicos',
        blocks: [
          'Las partes reconocen la validez de la aceptación de este Contrato y de sus anexos por medios electrónicos, ópticos o de cualquier otra tecnología, incluida la firma electrónica o la aceptación mediante casilla de verificación con registro de dirección IP, fecha y hora, conforme al Título Segundo (Del Comercio Electrónico) del Libro Segundo del Código de Comercio, en particular sus artículos 89 a 95.',
          '[Nota operativa: el portal actual no registra la aceptación digital del contrato; si se va a usar este mecanismo, debe implementarse antes.]'
        ]
      },
      {
        title: 'Cláusula séptima. Confidencialidad y datos personales',
        blocks: [
          'La información del Inversionista se tratará conforme al Aviso de Privacidad y al Convenio de Confidencialidad, que forman parte de este Contrato.'
        ]
      },
      {
        title: 'Cláusula octava. Legislación y jurisdicción',
        blocks: [
          `Este Contrato se rige por las leyes federales de los Estados Unidos Mexicanos. Para su interpretación y cumplimiento, las partes se someten a los tribunales competentes de ${CIUDAD}, renunciando a cualquier otro fuero.`,
          'Firmado en [LUGAR], el [FECHA]. — La Empresa: [FIRMA]. — El Inversionista: [FIRMA].'
        ]
      }
    ]
  },

  // ---------------------------------------------------------------------------------------------------
  {
    slug: 'convenio-de-confidencialidad',
    title: 'Convenio de Confidencialidad y No Divulgación',
    short: 'Convenio de confidencialidad',
    summary: 'Cómo protegemos su información financiera y patrimonial.',
    group: 'inversionistas',
    sections: [
      {
        title: '1. Partes y objeto',
        blocks: [
          `Convenio que celebran ${EMPRESA} (la "Empresa") y [NOMBRE DEL INVERSIONISTA / CLIENTE] (el "Cliente"), para establecer las obligaciones de la Empresa respecto de la información financiera y patrimonial del Cliente.`
        ]
      },
      {
        title: '2. Información Confidencial',
        blocks: [
          'Se considera Información Confidencial, de manera enunciativa y no limitativa: estados de cuenta, balances, montos invertidos, rendimientos, pagos y reinversiones; estrategias de inversión y composición de su portafolio; claves y credenciales de acceso; documentos de identidad, fiscales y bancarios; datos de beneficiarios, y cualquier otra información financiera o patrimonial del Cliente, en cualquier formato.'
        ]
      },
      {
        title: '3. Obligación de no divulgación',
        blocks: [
          'La Empresa se obliga a guardar estricta confidencialidad sobre la Información Confidencial, a usarla únicamente para los fines del contrato de inversión y a NO divulgarla, venderla, rentarla, monetizarla ni transferirla a terceros, salvo en los casos de excepción previstos en este Convenio.'
        ]
      },
      {
        title: '4. Excepción por consentimiento del Cliente',
        blocks: [
          'La Información Confidencial solo podrá revelarse a terceros cuando el Cliente lo autorice de forma expresa y por escrito, o mediante una confirmación digital verificable, en la que se identifique la información, el destinatario y la finalidad.'
        ]
      },
      {
        title: '5. Excepción legal',
        blocks: [
          'La Empresa podrá revelar la Información Confidencial cuando así lo requieran autoridades judiciales, fiscales (SAT) o financieras y de prevención de lavado de dinero (CNBV, UIF), mediante requerimiento por escrito, fundado y motivado. En ese caso, revelará solo la información estrictamente requerida y, cuando la ley lo permita, informará al Cliente.'
        ]
      },
      {
        title: '6. Medidas de seguridad',
        blocks: [
          'La Empresa mantiene medidas de seguridad técnicas, físicas y administrativas, entre ellas:',
          {
            list: [
              'Cifrado de la información en tránsito (HTTPS/TLS) y almacenamiento en infraestructura en la nube con controles de acceso.',
              'Contraseñas guardadas únicamente como valores protegidos (hash), nunca en texto legible.',
              'Verificación en dos pasos obligatoria para el personal de administración y bloqueo temporal ante intentos fallidos de acceso.',
              'Sesiones protegidas con cookies HttpOnly, Secure y SameSite=Strict, y separación del acceso: cada inversionista solo puede consultar su propia información.',
              'Documentos guardados en almacenamiento privado, accesible solo para la administración.',
              'Bitácora de las operaciones administrativas y acceso restringido del personal, sujeto a obligaciones de confidencialidad.'
            ]
          }
        ]
      },
      {
        title: '7. Vigencia',
        blocks: [
          'El deber de confidencialidad estará vigente durante la relación con el Cliente y hasta [cinco (5) años / de manera indefinida] después del cierre de su cuenta, sin perjuicio de los plazos de conservación que exija la ley.'
        ]
      },
      {
        title: '8. Incumplimiento',
        blocks: [
          'En caso de vulneración de la Información Confidencial atribuible a culpa o negligencia de la Empresa, ésta responderá por los daños y perjuicios que se acrediten conforme a la legislación aplicable, y notificará al Cliente sin demora cualquier vulneración de seguridad que afecte de forma significativa sus derechos, con las medidas adoptadas. [Definir, en su caso, pena convencional.]',
          `Este Convenio se rige por las leyes federales de los Estados Unidos Mexicanos, con sometimiento a los tribunales de ${CIUDAD}.`
        ]
      }
    ]
  },

  // ---------------------------------------------------------------------------------------------------
  {
    slug: 'declaracion-de-riesgos',
    title: 'Declaración de Riesgos y Descargo de Responsabilidad',
    short: 'Declaración de riesgos',
    summary: 'Lo que debe saber antes de invertir.',
    group: 'sitio',
    sections: [
      {
        title: 'Advertencias principales',
        blocks: [
          { callout: 'Toda inversión conlleva el riesgo de pérdida parcial o total del capital invertido.' },
          { callout: 'Rendimientos pasados no garantizan rendimientos futuros.' },
          { callout: 'No invierta recursos indispensables para su sustento personal o familiar, ni recursos que pueda necesitar antes del plazo pactado.' }
        ]
      },
      {
        title: '1. Riesgos de la inversión',
        blocks: [
          'Las inversiones en los ramos de negocio de Pimex Fortex Capital (transporte, movilidad, vehículos eléctricos, alimentos y otros) dependen del desempeño de negocios reales y están expuestas, entre otros, a riesgos de operación, de mercado, de liquidez, de crédito, regulatorios y de tipo de cambio en inversiones en dólares. Las tasas variables referidas a CETES pueden subir o bajar.',
          'Las tasas, plazos y montos que se publican en el sitio son de referencia; las condiciones definitivas son las de cada contrato.'
        ]
      },
      {
        title: '2. Naturaleza de la información',
        blocks: [
          'El contenido del sitio y del portal es informativo y no constituye asesoría financiera, fiscal ni legal personalizada, ni una recomendación de inversión. Cada inversionista debe evaluar, por sí mismo o con asesores independientes, si la inversión es adecuada para su situación. Los indicadores de mercado provienen de Banco de México y son informativos.'
        ]
      },
      {
        title: '3. Estatus regulatorio',
        blocks: [
          `${EMPRESA} es una [sociedad mercantil / figura legal] que opera bajo [esquema legal]. [OPCIÓN A: No es una institución financiera ni cuenta con autorización de la Comisión Nacional Bancaria y de Valores (CNBV) ni de Banco de México, y sus operaciones no están supervisadas por dichas autoridades. Los recursos invertidos no están protegidos por el Instituto para la Protección al Ahorro Bancario (IPAB).] [OPCIÓN B: Cuenta con autorización de [AUTORIDAD] número [NÚMERO] para operar como [FIGURA].]`,
          '[El abogado debe elegir y completar la opción que corresponda: esta declaración debe ser exacta para no inducir a error al público, conforme a la Ley Federal de Protección al Consumidor y demás normativa aplicable.]'
        ]
      },
      {
        title: '4. Limitación de responsabilidad',
        blocks: [
          'En la medida permitida por la ley, Pimex Fortex Capital no será responsable por decisiones de inversión tomadas únicamente con base en la información del sitio, ni por pérdidas derivadas de los riesgos descritos, sin perjuicio de las obligaciones que asume en cada contrato.'
        ]
      }
    ]
  },

  // ---------------------------------------------------------------------------------------------------
  {
    slug: 'politica-pld-kyc',
    title: 'Política de Conocimiento del Cliente (KYC) y Prevención de Lavado de Dinero (PLD)',
    short: 'Política KYC y PLD',
    summary: 'Cómo verificamos la identidad y el origen de los recursos.',
    group: 'sitio',
    sections: [
      {
        title: '1. Compromiso',
        blocks: [
          `${EMPRESA} se compromete con el cumplimiento de la Ley Federal para la Prevención e Identificación de Operaciones con Recursos de Procedencia Ilícita (LFPIORPI), su Reglamento y las reglas aplicables, y con evitar que sus servicios sean utilizados para operaciones con recursos de procedencia ilícita o para el financiamiento al terrorismo. [Confirmar con el oficial de cumplimiento si la actividad es vulnerable conforme a la LFPIORPI y las obligaciones de aviso que correspondan.]`
        ]
      },
      {
        title: '2. Identificación del cliente (KYC)',
        blocks: [
          'Antes de recibir cualquier aportación, solicitamos y verificamos:',
          {
            list: [
              'Identificación oficial vigente con fotografía: credencial para votar (INE) o pasaporte.',
              'Comprobante de domicilio con antigüedad no mayor a [tres (3)] meses.',
              'Constancia de Situación Fiscal con RFC y CURP.',
              'Carátula de estado de cuenta bancario a nombre del cliente, que acredite la titularidad de la cuenta desde la que aportará y en la que recibirá pagos.',
              'Personas morales: acta constitutiva, poderes del representante legal, identificación del representante, Constancia de Situación Fiscal y la identificación de los beneficiarios controladores.',
              'Declaración sobre el origen lícito de los recursos y, cuando proceda, información adicional sobre la actividad económica.'
            ]
          },
          'La información se actualiza periódicamente y cuando cambian las circunstancias del cliente.'
        ]
      },
      {
        title: '3. Monitoreo de operaciones',
        blocks: [
          {
            list: [
              'No se aceptan depósitos en efectivo, en ventanilla ni en tiendas de conveniencia, ni cualquier otro medio sin trazabilidad.',
              'Las aportaciones deben provenir exclusivamente de cuentas bancarias a nombre del propio inversionista; no se aceptan fondos de terceros.',
              'Los pagos de rendimientos y devoluciones de capital se realizan únicamente a cuentas a nombre del propio inversionista.',
              'Las operaciones se monitorean para detectar montos o patrones inusuales respecto del perfil del cliente.'
            ]
          }
        ]
      },
      {
        title: '4. Personas Expuestas Políticamente (PEP)',
        blocks: [
          'Si el cliente, o alguno de sus familiares o asociados cercanos, desempeña o ha desempeñado funciones públicas destacadas, se considerará Persona Expuesta Políticamente: se requerirá información adicional, la aprobación de un nivel directivo y un monitoreo reforzado de la relación.'
        ]
      },
      {
        title: '5. Medidas ante inconsistencias o alertas',
        blocks: [
          'Ante información falsa o inconsistente, la negativa a proporcionar documentación, operaciones inusuales o alertas de la Unidad de Inteligencia Financiera (UIF) u otra autoridad competente, Pimex Fortex Capital podrá abstenerse de iniciar la relación, suspender operaciones, bloquear o retener recursos en los términos que permita la ley, terminar la relación y presentar los avisos que correspondan ante la autoridad.'
        ]
      }
    ]
  },

  // ---------------------------------------------------------------------------------------------------
  {
    slug: 'atencion-a-usuarios',
    title: 'Atención a Usuarios, Aclaraciones y Quejas',
    short: 'Atención a usuarios',
    summary: 'Cómo presentar una aclaración o queja y a qué autoridad acudir.',
    group: 'sitio',
    sections: [
      {
        title: '1. Área de atención a clientes',
        blocks: [
          {
            table: {
              head: ['Medio', 'Dato'],
              rows: [
                ['Correo electrónico', CORREO_SOPORTE],
                ['Teléfono', TELEFONO],
                ['Horario', '[lunes a viernes de 9:00 a 18:00 horas, tiempo del centro de México]'],
                ['Domicilio', DOMICILIO],
                ['Tiempo máximo de respuesta', '[48 a 72] horas hábiles a partir de la asignación del folio']
              ]
            }
          }
        ]
      },
      {
        title: '2. Cómo presentar una aclaración o queja',
        blocks: [
          'Si no está de acuerdo con un movimiento de saldo, rendimiento, pago o reinversión que aparece en su portal:',
          {
            list: [
              `Escriba a ${CORREO_SOPORTE} desde el correo registrado en su cuenta, con el asunto "Aclaración".`,
              'Indique su nombre completo, el código de la inversión (por ejemplo, INV-2026-001), la fecha y el concepto del movimiento, y explique el motivo de su aclaración.',
              'Adjunte la documentación de soporte que tenga (comprobantes de transferencia o capturas del portal).',
              'Recibirá un número de folio para dar seguimiento.',
              'La respuesta se le enviará por escrito dentro del plazo indicado; si se requiere un ajuste, se reflejará en su portal una vez confirmado por la administración.'
            ]
          },
          'Si la respuesta no le satisface, puede solicitar una revisión de segundo nivel por el mismo medio o acudir a la autoridad competente.'
        ]
      },
      {
        title: '3. Autoridades competentes',
        blocks: [
          '[El abogado debe indicar cuál de las dos autoridades aplica según la figura legal de la empresa.]',
          'Si la empresa es una entidad financiera, puede acudir a la Comisión Nacional para la Protección y Defensa de los Usuarios de Servicios Financieros (CONDUSEF):',
          { list: ['Teléfono: 55 5340 0999 [verificar vigencia].', 'Portal: https://www.gob.mx/condusef'] },
          'Si la empresa es una sociedad mercantil que presta servicios al público consumidor, puede acudir a la Procuraduría Federal del Consumidor (PROFECO):',
          {
            list: [
              'Teléfono del Consumidor: 55 5568 8722 (Ciudad de México y área metropolitana) y 800 468 8722 (resto del país) [verificar vigencia].',
              'Concilianet (conciliación en línea): https://concilianet.profeco.gob.mx',
              'Portal: https://www.gob.mx/profeco'
            ]
          }
        ]
      }
    ]
  }
];

export const legalDoc = (slug: string | undefined) => LEGAL_DOCS.find((d) => d.slug === slug);
