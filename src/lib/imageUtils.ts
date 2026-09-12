/** Rasterizes an image (optionally rotated) to a data URL — used so the displayed/edited
 *  bitmap always matches the "displayed space" that annotation coordinates are stored in. */
export async function renderImageToDataUrl(
  bytes: Uint8Array,
  mime: string,
  targetWidth: number,
  rotationDeg: number = 0,
): Promise<{ url: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }))
  const rotated = rotationDeg % 180 !== 0
  const nativeW = bitmap.width
  const nativeH = bitmap.height
  const dispW = rotated ? nativeH : nativeW
  const dispH = rotated ? nativeW : nativeH
  const scale = targetWidth / dispW

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(dispW * scale)
  canvas.height = Math.round(dispH * scale)
  const ctx = canvas.getContext('2d')!
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotationDeg * Math.PI) / 180)
  ctx.drawImage(bitmap, -(nativeW * scale) / 2, -(nativeH * scale) / 2, nativeW * scale, nativeH * scale)
  ctx.restore()
  bitmap.close()

  return { url: canvas.toDataURL(mime === 'image/png' ? 'image/png' : 'image/jpeg', 0.92), width: canvas.width, height: canvas.height }
}
