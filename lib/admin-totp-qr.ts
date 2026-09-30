import QRCode from "qrcode";

/** SVG for the enroll screen. The URL is the otpauth link, not a page we fetch. */
export async function renderTotpQrSvg(otpauthUrl: string): Promise<string> {
  const svg = await QRCode.toString(otpauthUrl, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: {
      dark: "#111111",
      light: "#ffffff",
    },
  });
  return svg.replace(/^\uFEFF?<\?xml[^>]*>\s*/i, "");
}
