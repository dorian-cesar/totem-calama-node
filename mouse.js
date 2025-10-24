import mysql from 'mysql2/promise'
import usb from 'usb'
import iohook from 'iohook'
import axios from 'axios'

// ---------------- CONFIG ----------------

const DB_CONFIG = {
  host: 'ls-ac361eb6981fc8da3000dad63b382c39e5Qf1f3cd.cylsiewx0zgx.us-east-1.rds.amazonaws.com',
  user: 'dbmasteruser',
  password: 'CP7>2fobZp<7Kja!Efy3Q+~g:as2]rJD',
  database: 'parkingAndenes'
}

const API_URL = 'https://zkteco.terminal-calama.com/zteco-backend/openEntrada.php'

// IDs de la impresora KR403
const PRINTER_VENDOR_ID = 0x0483
const PRINTER_PRODUCT_ID = 0x5743

// ---------------- FUNCIONES ----------------

// Mostrar listado de dispositivos USB (opcional)
function listUsbDevices() {
  console.log('\n🔌 Dispositivos USB detectados:')
  const devices = usb.getDeviceList()

  devices.forEach((device, index) => {
    const desc = device.deviceDescriptor
    console.log(
      `#${index + 1} → VendorID: 0x${desc.idVendor.toString(16).padStart(4,'0')} | ` +
      `ProductID: 0x${desc.idProduct.toString(16).padStart(4,'0')}`
    )
  })

  console.log(`Total detectados: ${devices.length}\n`)
}

// Obtener la última patente con estado 'Ingresado'
async function getLatestParkingEntry() {
  const conn = await mysql.createConnection(DB_CONFIG)
  const [rows] = await conn.execute(`
    SELECT idmov, patente 
    FROM movParking 
    WHERE estado = 'Ingresado' 
    ORDER BY idmov DESC 
    LIMIT 1
  `)
  await conn.end()
  return rows.length > 0 ? rows[0] : null
}

// Actualizar el estado a 'Insite'
async function updateParkingStatus(idmov) {
  const conn = await mysql.createConnection(DB_CONFIG)
  await conn.execute(`UPDATE movParking SET estado = 'Insite' WHERE idmov = ?`, [idmov])
  await conn.end()
}

// Imprimir ticket con KR403
import HID from 'node-hid' // Para abrir la impresora
function printTicket(patente) {
  const printer = usb.findByIds(PRINTER_VENDOR_ID, PRINTER_PRODUCT_ID)
  if (!printer) {
    console.log('❌ Impresora KR403 no encontrada')
    return
  }

  try {
    printer.open()
    const iface = printer.interfaces[0]
    if (iface.isKernelDriverActive()) iface.detachKernelDriver()
    iface.claim()

    const endpoint = iface.endpoints.find(e => e.direction === 'out')
    if (!endpoint) throw new Error('No se encontró endpoint de salida')

    const text = `\nPatente: ${patente}\n`
    const barcode = Buffer.from([0x1D, 0x6B, 0x04, ...Buffer.from(patente), 0x00])

    endpoint.transfer(Buffer.from(text, 'ascii'))
    endpoint.transfer(barcode)

    iface.release(true, err => {
      if (err) console.error('Error liberando interfaz:', err)
      printer.close()
    })

    console.log('🖨️ Ticket impreso correctamente')
  } catch (err) {
    console.error('Error al imprimir:', err.message)
  }
}

// Llamar a la API
async function callApi() {
  try {
    const response = await axios.get(API_URL)
    if (response.status === 200) {
      console.log('🌐 API llamada exitosamente.')
    } else {
      console.log(`⚠️ Error en la API: ${response.status}`)
    }
  } catch (err) {
    console.error('Error al llamar la API:', err.message)
  }
}

// ---------------- MAIN ----------------

listUsbDevices()

console.log('🖱️ Esperando clic del mouse...')

// Captura cualquier clic de mouse con iohook
iohook.on('mousedown', async event => {
  console.log('🔘 Mouse clic detectado → procesando flujo parking...')

  const entry = await getLatestParkingEntry()
  if (entry) {
    const { idmov, patente } = entry
    console.log(`Última patente ingresada: ${patente}`)
    printTicket(patente)
    await updateParkingStatus(idmov)
    console.log("✅ Estado actualizado a 'Insite'")
    await callApi()
  } else {
    console.log('⚠️ No hay registros con estado "Ingresado".')
  }
})

iohook.start()
