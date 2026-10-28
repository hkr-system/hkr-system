// Client portal copy, English and Spanish (Gabriel, Oct 27 2026: EN + ES like /apply).
// Figures and terms come from the SOP only; prices never appear here.
import type { Database } from "@/types/database";

type OrderStatus = Database["public"]["Enums"]["order_status"];
export type PortalLang = "en" | "es";

export const PORTAL_TEXT = {
  en: {
    portal: "Client portal", home: "Home", orders: "Orders", rmas: "RMAs", newRma: "New RMA request", priceList: "Price list",
    terms: "Terms and conditions", signOut: "Sign out", language: "Español",
    hello: (n: string) => `Welcome, ${n}`,
    homeIntro: "Your orders, IMEIs, invoices and RMAs with HK Refurbished Stock, in one place.",
    openOrders: "Open orders", balancePending: "Balance pending", openRmas: "Open RMAs", creditsToApply: "Credit notes to apply",
    nextSteps: "What happens next", nothingPending: "Nothing pending right now.",
    order: "Order", status: "Status", date: "Date", units: "Units", invoiceTotal: "Invoice total", toPay: "Amount payable",
    deposit: "Deposit 10 %", paid: "Paid (confirmed)", pending: "Pending", eta: "Ready date (ETA)", shipped: "Shipped", tracking: "Tracking",
    delivered: "Delivered", products: "Products", qty: "Qty", unitPrice: "Unit price", amount: "Amount", imeis: "IMEIs",
    downloadImeis: "Download IMEI list (xlsx)", documents: "Documents", noDocuments: "No documents yet.", invoiceHK: "Invoice",
    paymentProcessing: "We received a payment proof; it is being confirmed.",
    allOrders: "All orders", back: "Back",
    rmaPending: "Open RMAs", rmaHistory: "History", rmaUnresolved: "Without a solution yet", rma: "RMA", submitted: "Submitted",
    resolution: "Resolution", unitStatus: "Unit status", evidence: "Evidence", credit: "Credit", noRmas: "No RMAs yet.",
    imei: "IMEI", fault: "Fault", source: "Found", detected: "Detected on", swollen: "Battery swollen", damage: "Physical / liquid damage",
    imeiNotFound: "This IMEI is not in our shipment records for your account. Check it again (Settings › General › About, the SIM tray or the box label). We can only process units whose IMEI matches our records.",
    imeiFound: (o: string, w: string | null) => `Shipped to you in ${o}${w ? ` · warranty until ${w}` : ""}.`,
    imeiOutOfWarranty: "Outside the 12-month warranty: units outside the warranty are not covered.",
    imeiClaimedBefore: (r: string) => `This IMEI was already claimed in ${r}.`,
    imeiInvalid: "An IMEI has 15 digits.", imeiCheckDigit: "The last digit does not match (check digit): please re-check the IMEI.",
    swollenWarn: "Do NOT ship a unit with a swollen battery by air. Keep it apart; we will tell you how it is handled.",
    damageWarn: "Physical or liquid damage is not covered.",
    addUnit: "Add a unit", removeUnit: "Remove", unit: "Unit", faultCategory: "Fault category", faultText: "What happens, and when",
    faultPlaceholder: "e.g. screen flickers after 5 minutes", sourceTesting: "When testing the delivery", sourceCustomer: "Returned by my customer",
    photos: "Photo or short video showing the fault and the IMEI", addFiles: "Add files", whereNow: "Where are the units now?",
    orderRefs: "Order / invoice number(s)", contactName: "Contact person", contactInfo: "Email / WhatsApp", notes: "Anything else we should know?",
    submit: "Send RMA request", sending: "Sending…", uploading: (n: number, t: number) => `Uploading evidence ${n} of ${t}…`,
    rules: [
      "One line per defective unit, with its IMEI and at least one photo or short video showing the fault and the IMEI.",
      "Do not ship any unit before we confirm the RMA and give you the instructions.",
      "Physical or liquid damage, and units outside the 12-month warranty, are not covered.",
    ],
    sent: (n: string) => `Request ${n} sent. We will check the IMEIs and the evidence and come back to you.`,
    missingEvidence: "Some units have no evidence yet. Add a photo or video to each one so we can review the request.",
    addEvidence: "Add evidence", evidenceAdded: "Evidence added.", completeRequest: "Send for review",
    priceListSoon: "Your current price list will appear here. It is being prepared; meanwhile your account manager sends it to you.",
    termsSoon: "Our terms and conditions (RMA address and procedure, payment details, responsibilities) will be published here soon.",
    termsSummary: "Main terms today", noAccess: "This login has no portal access. Ask your account manager.",
    loginTitle: "Sign in to your client portal", loginIntro: "Enter your email. If it has access, we send you a sign-in link (valid for 1 hour).",
    email: "Email", sendLink: "Send me the link", linkSent: "If this email has access to the portal, the link is on its way. Check your inbox (and spam).",
    linkError: "The link is not valid or has expired. Ask for a new one.",
  },
  es: {
    portal: "Portal de clientes", home: "Inicio", orders: "Órdenes", rmas: "RMAs", newRma: "Nueva solicitud de RMA", priceList: "Lista de precios",
    terms: "Términos y condiciones", signOut: "Salir", language: "English",
    hello: (n: string) => `Bienvenido, ${n}`,
    homeIntro: "Tus órdenes, IMEIs, facturas y RMAs con HK Refurbished Stock, en un solo lugar.",
    openOrders: "Órdenes abiertas", balancePending: "Saldo pendiente", openRmas: "RMAs abiertos", creditsToApply: "Notas de crédito por aplicar",
    nextSteps: "Qué sigue", nothingPending: "Nada pendiente por ahora.",
    order: "Orden", status: "Estado", date: "Fecha", units: "Unidades", invoiceTotal: "Total factura", toPay: "Monto a pagar",
    deposit: "Depósito 10 %", paid: "Pagado (confirmado)", pending: "Pendiente", eta: "Fecha lista (ETA)", shipped: "Enviada", tracking: "Rastreo",
    delivered: "Entregada", products: "Productos", qty: "Cant.", unitPrice: "Precio unitario", amount: "Monto", imeis: "IMEIs",
    downloadImeis: "Descargar lista de IMEIs (xlsx)", documents: "Documentos", noDocuments: "Aún no hay documentos.", invoiceHK: "Factura",
    paymentProcessing: "Recibimos un comprobante de pago; lo estamos confirmando.",
    allOrders: "Todas las órdenes", back: "Volver",
    rmaPending: "RMAs abiertos", rmaHistory: "Historial", rmaUnresolved: "Aún sin solución", rma: "RMA", submitted: "Enviado",
    resolution: "Resolución", unitStatus: "Estado de la unidad", evidence: "Evidencias", credit: "Crédito", noRmas: "Aún no hay RMAs.",
    imei: "IMEI", fault: "Falla", source: "Detectada", detected: "Fecha detectada", swollen: "Batería hinchada", damage: "Daño físico / líquido",
    imeiNotFound: "Este IMEI no está en nuestros registros de envíos a tu cuenta. Revísalo de nuevo (Ajustes › General › Información, la bandeja SIM o la etiqueta de la caja). Solo podemos procesar unidades cuyo IMEI coincide con nuestros registros.",
    imeiFound: (o: string, w: string | null) => `Te lo enviamos en ${o}${w ? ` · garantía hasta ${w}` : ""}.`,
    imeiOutOfWarranty: "Fuera de la garantía de 12 meses: las unidades fuera de garantía no están cubiertas.",
    imeiClaimedBefore: (r: string) => `Este IMEI ya fue reclamado en ${r}.`,
    imeiInvalid: "Un IMEI tiene 15 dígitos.", imeiCheckDigit: "El último dígito no coincide (dígito verificador): revisa el IMEI.",
    swollenWarn: "NO envíes por avión una unidad con la batería hinchada. Sepárala; te diremos cómo se maneja.",
    damageWarn: "El daño físico o por líquido no está cubierto.",
    addUnit: "Agregar unidad", removeUnit: "Quitar", unit: "Unidad", faultCategory: "Tipo de falla", faultText: "Qué pasa y cuándo",
    faultPlaceholder: "ej. la pantalla parpadea después de 5 minutos", sourceTesting: "Al probar la entrega", sourceCustomer: "Devuelta por mi cliente",
    photos: "Foto o video corto que muestre la falla y el IMEI", addFiles: "Agregar archivos", whereNow: "¿Dónde están las unidades ahora?",
    orderRefs: "Número(s) de orden / factura", contactName: "Persona de contacto", contactInfo: "Correo / WhatsApp", notes: "¿Algo más que debamos saber?",
    submit: "Enviar solicitud de RMA", sending: "Enviando…", uploading: (n: number, t: number) => `Subiendo evidencia ${n} de ${t}…`,
    rules: [
      "Una línea por unidad defectuosa, con su IMEI y al menos una foto o video corto que muestre la falla y el IMEI.",
      "No envíes ninguna unidad antes de que confirmemos el RMA y te demos las instrucciones.",
      "El daño físico o por líquido, y las unidades fuera de la garantía de 12 meses, no están cubiertos.",
    ],
    sent: (n: string) => `Solicitud ${n} enviada. Revisaremos los IMEIs y las evidencias y te responderemos.`,
    missingEvidence: "Algunas unidades aún no tienen evidencia. Agrega una foto o video a cada una para que podamos revisar la solicitud.",
    addEvidence: "Agregar evidencia", evidenceAdded: "Evidencia agregada.", completeRequest: "Enviar a revisión",
    priceListSoon: "Aquí verás tu lista de precios vigente. La estamos preparando; mientras tanto tu ejecutivo de cuenta te la envía.",
    termsSoon: "Pronto publicaremos aquí nuestros términos y condiciones (dirección y procedimiento de RMA, datos de pago, responsabilidades).",
    termsSummary: "Términos principales hoy", noAccess: "Este usuario no tiene acceso al portal. Consulta a tu ejecutivo de cuenta.",
    loginTitle: "Entra a tu portal de cliente", loginIntro: "Escribe tu correo. Si tiene acceso, te enviamos un enlace para entrar (válido 1 hora).",
    email: "Correo", sendLink: "Envíame el enlace", linkSent: "Si este correo tiene acceso al portal, el enlace va en camino. Revisa tu bandeja (y spam).",
    linkError: "El enlace no es válido o venció. Pide uno nuevo.",
  },
} as const;

export type PortalText = (typeof PORTAL_TEXT)["en"];

// Order status in the client's words (what it means for them).
export const PORTAL_ORDER_STATUS: Record<PortalLang, Record<OrderStatus, string>> = {
  en: {
    quoted: "Quote", invoiced: "Invoiced — deposit pending", deposit_paid: "Deposit received", in_preparation: "In preparation",
    ready_to_ship: "Ready — balance pending", balance_paid: "Paid — shipping soon", shipped: "Shipped", delivered: "Delivered", closed: "Closed",
  },
  es: {
    quoted: "Cotización", invoiced: "Facturada — depósito pendiente", deposit_paid: "Depósito recibido", in_preparation: "En preparación",
    ready_to_ship: "Lista — saldo pendiente", balance_paid: "Pagada — por enviar", shipped: "Enviada", delivered: "Entregada", closed: "Cerrada",
  },
};

export const PORTAL_ORDER_NEXT: Record<PortalLang, Partial<Record<OrderStatus, string>>> = {
  en: {
    invoiced: "Please pay the 10 % deposit and send us the proof.",
    deposit_paid: "We are confirming the ready date with Hong Kong.",
    in_preparation: "Your goods are being prepared.",
    ready_to_ship: "Your goods are ready: please pay the balance so we can ship.",
    balance_paid: "We are booking the shipment; you will get the tracking.",
    shipped: "On the way. Test the units on arrival and report any defect with an RMA request.",
  },
  es: {
    invoiced: "Por favor paga el depósito del 10 % y envíanos el comprobante.",
    deposit_paid: "Estamos confirmando la fecha de entrega con Hong Kong.",
    in_preparation: "Tu mercancía se está preparando.",
    ready_to_ship: "Tu mercancía está lista: paga el saldo para poder enviarla.",
    balance_paid: "Estamos preparando el envío; recibirás el rastreo.",
    shipped: "En camino. Prueba las unidades al recibirlas y reporta cualquier falla con una solicitud de RMA.",
  },
};

// Terms shown until the official document exists — the same SOP figures as /apply.
export const PORTAL_TERMS: Record<PortalLang, [string, string][]> = {
  en: [
    ["Minimum order", "US$20,000 (sample order from US$10,000 for buyers of 400+ units/month)"],
    ["Payment", "10 % deposit, 90 % balance before shipment · wire or USDT (TRC-20)"],
    ["Prices", "USD, FOB Hong Kong"],
    ["Warranty", "12 months from delivery"],
    ["RMA", "Return to Hong Kong (3–4 weeks) or repair credit, as agreed per case"],
  ],
  es: [
    ["Orden mínima", "US$20.000 (orden de muestra desde US$10.000 para compradores de 400+ unidades/mes)"],
    ["Pago", "10 % de depósito, 90 % de saldo antes del envío · transferencia o USDT (TRC-20)"],
    ["Precios", "USD, FOB Hong Kong"],
    ["Garantía", "12 meses desde la entrega"],
    ["RMA", "Devolución a Hong Kong (3–4 semanas) o crédito de reparación, según se acuerde en cada caso"],
  ],
};
