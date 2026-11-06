import { google } from "googleapis";

function getServiceAccount(): Record<string, unknown> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não configurado");
  return JSON.parse(raw);
}

export async function getSheetsClient() {
  const credentials = getServiceAccount();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

/**
 * Lê uma faixa com números crus (sem "R$" nem separador de milhar) e datas
 * como texto formatado. Usado pelos fechamentos, que precisam de valores
 * exatos; o report semanal continua usando readSheetRange.
 */
export async function readSheetValues(sheetId: string, range: string): Promise<(string | number | boolean)[][]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  return (res.data.values ?? []) as (string | number | boolean)[][];
}

export async function readSheetRange(sheetId: string, range: string) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });
  return res.data.values ?? [];
}
