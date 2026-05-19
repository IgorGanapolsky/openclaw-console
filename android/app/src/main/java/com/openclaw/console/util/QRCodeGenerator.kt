package com.openclaw.console.util

import android.graphics.Bitmap
import android.graphics.Color
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

object QRCodeGenerator {

    /**
     * Generates a QR code bitmap for the given text content.
     *
     * @param content The text to encode in the QR code
     * @param size The size of the QR code in pixels (width = height)
     * @return A Bitmap containing the QR code
     */
    fun generateQRCode(content: String, size: Int = 512): Bitmap {
        val hints = mapOf(
            EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
            EncodeHintType.MARGIN to 1
        )

        val writer = QRCodeWriter()
        val bitMatrix = writer.encode(content, BarcodeFormat.QR_CODE, size, size, hints)

        val width = bitMatrix.width
        val height = bitMatrix.height
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)

        for (x in 0 until width) {
            for (y in 0 until height) {
                bitmap.setPixel(x, y, if (bitMatrix[x, y]) Color.BLACK else Color.WHITE)
            }
        }

        return bitmap
    }

    /**
     * Generates a gateway URL QR code with fallback discovery info.
     *
     * @param gatewayUrl The OpenClaw gateway URL (e.g. "http://192.168.1.100:18789")
     * @param size QR code size in pixels
     * @return QR code bitmap
     */
    fun generateGatewayQRCode(gatewayUrl: String, size: Int = 512): Bitmap {
        // OpenClaw gateway URL format for mobile console
        val qrContent = if (gatewayUrl.contains("://")) {
            gatewayUrl
        } else {
            "http://$gatewayUrl"
        }

        return generateQRCode(qrContent, size)
    }
}