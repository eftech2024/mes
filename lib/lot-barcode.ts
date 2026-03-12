export interface LotBarcodeLike {
  barcode_value: string
  is_primary?: boolean | null
  barcode_type?: string | null
}

export function getPrimaryLotBarcode(barcodes: LotBarcodeLike[] | null | undefined, fallbackLotNo?: string | null) {
  if (!barcodes || barcodes.length === 0) {
    return fallbackLotNo ?? ''
  }

  const primaryBarcode = barcodes.find(barcode => barcode.is_primary)
  if (primaryBarcode?.barcode_value) {
    return primaryBarcode.barcode_value
  }

  const internalBarcode = barcodes.find(barcode => barcode.barcode_type === 'INTERNAL')
  if (internalBarcode?.barcode_value) {
    return internalBarcode.barcode_value
  }

  return barcodes[0]?.barcode_value ?? fallbackLotNo ?? ''
}